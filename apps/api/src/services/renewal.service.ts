/**
 * renewal.service.ts
 *
 * Automatic expiry detection and renewal initiation (cron-only, runs daily).
 *
 * Phase 1: Mark active certificates whose expiryDate has passed → 'expired'
 * Phase 2: Initiate a new ACME order for every expired certificate
 *          → status flips to 'pending_challenge' with fresh challenge values
 *
 * Manual verify + generate is required via the UI after each renewal initiation.
 */

import { Types } from 'mongoose'
import { CertificateModel, ChallengeType } from '@src/models/certificate.model'
import { UserModel } from '@src/models/user.model'
import { acmeService } from '@src/services/acme.service'
import { logger } from '@src/shared/utils/logger'

interface RenewalResult {
  attempted: number
  succeeded: number
  failed: number
}

async function markExpiredCertificates(): Promise<number> {
  const result = await CertificateModel.updateMany(
    { status: 'active', expiryDate: { $lt: new Date() } },
    { $set: { status: 'expired' } },
  )

  const count = result.modifiedCount
  if (count > 0) {
    logger.warn({ count }, 'Renewal[1/2]: marked certificates as expired')
  } else {
    logger.info('Renewal[1/2]: no active certificates have expired')
  }
  return count
}

async function initiateRenewalOrders(): Promise<RenewalResult> {
  const expired = await CertificateModel.find({ status: 'expired' })
    .select('certName organizationId challengeType')
    .lean()

  const result: RenewalResult = { attempted: expired.length, succeeded: 0, failed: 0 }

  if (expired.length === 0) {
    logger.info('Renewal[2/2]: no expired certificates to renew')
    return result
  }

  logger.info({ count: expired.length }, 'Renewal[2/2]: initiating ACME orders for expired certificates')

  const TTL_MS  = 5 * 60 * 1000
  const ttlEdge = new Date(Date.now() - TTL_MS)

  for (const cert of expired) {
    const log = logger.child({ certName: cert.certName, orgId: cert.organizationId.toString() })

    try {
      // Atomic claim — prevents parallel workers from double-processing
      const claimed = await CertificateModel.updateOne(
        {
          _id:    cert._id,
          status: 'expired',
          $or: [
            { lastChecked: { $exists: false } },
            { lastChecked: { $lt: ttlEdge } },
          ],
        },
        { $set: { lastChecked: new Date() } },
      )

      if (claimed.modifiedCount === 0) {
        log.info('Renewal: already claimed by another process, skipping')
        continue
      }

      const admin = await UserModel.findOne({
        organizationId: new Types.ObjectId(cert.organizationId),
        role: 'admin',
      }).lean()

      if (!admin) {
        log.warn('Renewal: no admin user for org — skipping')
        result.failed++
        continue
      }

      await acmeService.initiateOrder(
        cert.certName,
        cert.organizationId.toString(),
        admin.email,
        cert.challengeType ?? ChallengeType.DNS_01,
      )

      log.info({ adminEmail: admin.email }, 'Renewal: order initiated — DNS update required')
      result.succeeded++
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      log.error({ err }, 'Renewal: failed to initiate order')

      await CertificateModel.updateOne(
        { _id: cert._id },
        { $set: { renewalError: message, renewalFailedAt: new Date() } },
      ).catch((dbErr: unknown) => log.error({ dbErr }, 'Renewal: failed to persist renewalError'))

      result.failed++
    }
  }

  return result
}

export async function checkAndRenewExpired(): Promise<void> {
  const expiredCount  = await markExpiredCertificates()
  const renewalResult = await initiateRenewalOrders()

  logger.info(
    {
      newlyExpired:      expiredCount,
      renewalAttempted:  renewalResult.attempted,
      renewalSucceeded:  renewalResult.succeeded,
      renewalFailed:     renewalResult.failed,
    },
    'Renewal: run complete',
  )
}
