/**
 * renewal.service.ts
 *
 * Automatic pre-expiry detection and renewal initiation (cron-only, runs daily).
 *
 * Phase 1: Mark active certificates whose expiryDate is within 10 days → 'renewing'
 * Phase 2: Initiate a new ACME order for every certificate in 'renewing' state
 *          that has either never failed or whose next-retry time has passed.
 *
 * Retry schedule (exponential backoff, capped at 24 h):
 *   attempt 1 → +1 h, attempt 2 → +2 h, attempt 3 → +4 h …
 *   after MAX_RENEWAL_RETRIES failures the cert is marked 'failed' and skipped.
 *
 * The existing PEM remains downloadable while the cert is in 'renewing' state.
 */

import { Types } from 'mongoose'
import { CertificateModel, ChallengeType } from '@src/models/certificate.model'
import { UserModel } from '@src/models/user.model'
import { acmeService } from '@src/services/acme.service'
import { logger } from '@src/shared/utils/logger'

const RENEWAL_BUFFER_MS    = 10 * 24 * 60 * 60 * 1000   // 10 days
const MAX_RENEWAL_RETRIES  = 5
const BASE_RETRY_DELAY_MS  = 60 * 60 * 1000              // 1 hour
const MAX_RETRY_DELAY_MS   = 24 * 60 * 60 * 1000         // 24 hours cap

interface RenewalResult {
  attempted: number
  succeeded: number
  failed: number
  skipped: number
}

function nextRetryDelay(retryCount: number): number {
  return Math.min(BASE_RETRY_DELAY_MS * Math.pow(2, retryCount), MAX_RETRY_DELAY_MS)
}

async function markCertsForRenewal(): Promise<number> {
  const result = await CertificateModel.updateMany(
    { status: 'active', expiryDate: { $lt: new Date(Date.now() + RENEWAL_BUFFER_MS) } },
    { $set: { status: 'renewing', renewalRetryCount: 0 }, $unset: { renewalNextRetryAt: '' } },
  )

  const count = result.modifiedCount
  if (count > 0) {
    logger.warn({ count }, "Renewal[1/2]: marked N certificate(s) as 'renewing'")
  } else {
    logger.info('Renewal[1/2]: no active certificates approaching expiry')
  }
  return count
}

async function initiateRenewalOrders(): Promise<RenewalResult> {
  const now = new Date()

  // Only pick up certs that are ready to retry (no next-retry gate, or gate has passed)
  const renewing = await CertificateModel.find({
    status: 'renewing',
    $or: [
      { renewalNextRetryAt: { $exists: false } },
      { renewalNextRetryAt: { $lte: now } },
    ],
  })
    .select('certName organizationId challengeType renewalRetryCount')
    .lean()

  const result: RenewalResult = { attempted: renewing.length, succeeded: 0, failed: 0, skipped: 0 }

  if (renewing.length === 0) {
    logger.info('Renewal[2/2]: no certificates ready for renewal attempt')
    return result
  }

  logger.info({ count: renewing.length }, "Renewal[2/2]: initiating ACME orders for 'renewing' certificates")

  const TTL_MS  = 5 * 60 * 1000
  const ttlEdge = new Date(Date.now() - TTL_MS)

  for (const cert of renewing) {
    const retryCount = cert.renewalRetryCount ?? 0
    const log = logger.child({
      certName:   cert.certName,
      orgId:      cert.organizationId.toString(),
      retryCount,
    })

    try {
      // Atomic claim — prevents parallel workers from double-processing
      const claimed = await CertificateModel.updateOne(
        {
          _id:    cert._id,
          status: 'renewing',
          $or: [
            { lastChecked: { $exists: false } },
            { lastChecked: { $lt: ttlEdge } },
          ],
        },
        { $set: { lastChecked: new Date() } },
      )

      if (claimed.modifiedCount === 0) {
        log.info('Renewal: already claimed by another process, skipping')
        result.skipped++
        continue
      }

      const admin = await UserModel.findOne({
        organizationId: new Types.ObjectId(cert.organizationId),
        role: 'admin',
      }).lean()

      if (!admin) {
        log.warn('Renewal: no admin user for org — skipping')
        result.skipped++
        continue
      }

      await acmeService.initiateOrder(
        cert.certName,
        cert.organizationId.toString(),
        admin.email,
        cert.challengeType ?? ChallengeType.DNS_01,
      )

      // Clear retry bookkeeping on success
      await CertificateModel.updateOne(
        { _id: cert._id },
        {
          $set:   { renewalRetryCount: 0 },
          $unset: { renewalNextRetryAt: '', renewalError: '', renewalFailedAt: '' },
        },
      ).catch((dbErr: unknown) => log.error({ dbErr }, 'Renewal: failed to clear retry state'))

      log.info({ adminEmail: admin.email }, 'Renewal: order initiated — DNS update required')
      result.succeeded++
    } catch (err) {
      const message    = err instanceof Error ? err.message : String(err)
      const newCount   = retryCount + 1
      const exhausted  = newCount >= MAX_RENEWAL_RETRIES

      log.error({ err, attempt: newCount, maxRetries: MAX_RENEWAL_RETRIES }, 'Renewal: failed to initiate order')

      if (exhausted) {
        await CertificateModel.updateOne(
          { _id: cert._id },
          {
            $set: {
              status:           'failed',
              renewalError:     message,
              renewalFailedAt:  new Date(),
              renewalRetryCount: newCount,
            },
            $unset: { renewalNextRetryAt: '' },
          },
        ).catch((dbErr: unknown) => log.error({ dbErr }, 'Renewal: failed to mark cert as failed'))

        log.error({ certName: cert.certName }, 'Renewal: max retries reached — marked as failed')
      } else {
        const delay        = nextRetryDelay(newCount)
        const nextRetryAt  = new Date(Date.now() + delay)

        await CertificateModel.updateOne(
          { _id: cert._id },
          {
            $set: {
              renewalError:      message,
              renewalFailedAt:   new Date(),
              renewalRetryCount: newCount,
              renewalNextRetryAt: nextRetryAt,
            },
          },
        ).catch((dbErr: unknown) => log.error({ dbErr }, 'Renewal: failed to persist retry state'))

        log.warn(
          { nextRetryAt, delayMs: delay },
          `Renewal: will retry at ${nextRetryAt.toISOString()}`,
        )
      }

      result.failed++
    }
  }

  return result
}

/**
 * Checks for certificates approaching expiry (within 10 days) and schedules
 * ACME renewal orders for them. Called by the daily renewal cron job.
 */
export async function checkAndScheduleRenewals(): Promise<void> {
  const markedCount   = await markCertsForRenewal()
  const renewalResult = await initiateRenewalOrders()

  logger.info(
    {
      markedForRenewal:  markedCount,
      renewalAttempted:  renewalResult.attempted,
      renewalSucceeded:  renewalResult.succeeded,
      renewalFailed:     renewalResult.failed,
      renewalSkipped:    renewalResult.skipped,
    },
    'Renewal: run complete',
  )
}
