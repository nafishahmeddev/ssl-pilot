/**
 * renewal.service.ts
 *
 * Handles automatic expiry detection and renewal initiation for SSL certificates.
 *
 * Responsibilities (cron-only, runs daily):
 *   1. Mark active certificates whose expiryDate has passed → status: 'expired'
 *   2. Initiate a new ACME DNS-01 order for every expired certificate
 *      → status flips to 'pending_challenge' with fresh TXT record values
 *
 * NOT in scope here:
 *   - Issuing new certificates (admin panel)
 *   - Verifying DNS challenges (admin panel)
 *   - Expiring-soon warnings (UI concern only)
 */

import { Types } from 'mongoose'
import { DomainModel, ChallengeType } from '@src/models/domain.model'
import { UserModel } from '@src/models/user.model'
import { acmeService } from '@src/services/acme.service'
import { logger } from '@src/shared/utils/logger'

/** Outcome counters returned by {@link initiateRenewalOrders}. */
interface RenewalResult {
  attempted: number
  succeeded: number
  failed: number
}

/**
 * Phase 1 — Expire stale certificates.
 *
 * Finds every domain that is still marked `active` but whose
 * `expiryDate` is in the past, and flips its status to `expired`.
 *
 * @returns Number of certificates transitioned to `expired`.
 */
async function markExpiredCertificates(): Promise<number> {
  const now = new Date()

  const result = await DomainModel.updateMany(
    { status: 'active', expiryDate: { $lt: now } },
    { $set: { status: 'expired' } }
  )

  const count = result.modifiedCount

  if (count > 0) {
    logger.warn({ count, asOf: now.toISOString() }, 'Renewal[1/2]: marked certificates as expired')
  } else {
    logger.info('Renewal[1/2]: no active certificates have expired')
  }

  return count
}

/**
 * Phase 2 — Initiate ACME renewal orders for expired certificates.
 *
 * For each domain with `status: 'expired'`, looks up the org admin email,
 * then calls {@link AcmeService.initiateOrder} which:
 *   - Creates a new Let's Encrypt order
 *   - Persists fresh TXT record values to the domain doc
 *   - Sets status back to `pending_challenge`
 *
 * The admin must then update the DNS record and verify via the admin panel.
 *
 * @returns Counts of attempted / succeeded / failed renewal initiations.
 */
async function initiateRenewalOrders(): Promise<RenewalResult> {
  const expired = await DomainModel.find({ status: 'expired' })
    .select('domainName organizationId domainType challengeType')
    .lean()

  const result: RenewalResult = { attempted: expired.length, succeeded: 0, failed: 0 }

  if (expired.length === 0) {
    logger.info('Renewal[2/2]: no expired certificates to renew')
    return result
  }

  logger.info({ count: expired.length }, 'Renewal[2/2]: initiating ACME orders for expired certificates')

  const TTL = 5 * 60 * 1000 // 5 minutes
  const ttlEdge = new Date(Date.now() - TTL)

  for (const domain of expired) {
    const log = logger.child({ domain: domain.domainName, orgId: domain.organizationId.toString() })

    try {
      // Claim the task atomically to prevent race conditions
      const updateResult = await DomainModel.updateOne(
        {
          _id: domain._id,
          status: 'expired',
          $or: [
            { lastChecked: { $exists: false } },
            { lastChecked: { $lt: ttlEdge } },
          ],
        },
        { $set: { lastChecked: new Date() } }
      )

      if (updateResult.modifiedCount === 0) {
        log.info('Renewal: skipping, already picked up by another process or status changed')
        continue
      }

      // Fetch org admin to obtain the contact email for this ACME account
      const admin = await UserModel.findOne({
        organizationId: new Types.ObjectId(domain.organizationId),
        role: 'admin',
      }).lean()

      if (!admin) {
        log.warn('Renewal: no admin user found for org — skipping')
        result.failed++
        continue
      }

      await acmeService.initiateOrder(
        domain.domainName,
        domain.organizationId.toString(),
        admin.email,
        domain.challengeType ?? ChallengeType.DNS_01,
        domain.domainType,
      )

      log.info({ adminEmail: admin.email }, 'Renewal: ACME order initiated — DNS update required in admin panel')
      result.succeeded++
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      log.error({ err }, 'Renewal: failed to initiate ACME order — marking for manual intervention')

      // Persist the error so the admin panel can surface it and prompt the user
      // to trigger renewal manually. Only the user (via admin panel) can clear this.
      await DomainModel.findOneAndUpdate(
        { _id: domain._id },
        { $set: { renewalError: message, renewalFailedAt: new Date() } }
      ).catch((dbErr: unknown) => log.error({ dbErr }, 'Renewal: failed to persist renewalError'))

      result.failed++
    }
  }

  return result
}

/**
 * Entry point called by the renewal cron job.
 *
 * Runs Phase 1 (mark expired) then Phase 2 (initiate renewals) sequentially.
 * Logs a summary on completion.
 */
export async function checkAndRenewExpired(): Promise<void> {
  const expiredCount = await markExpiredCertificates()
  const renewalResult = await initiateRenewalOrders()

  logger.info(
    {
      newlyExpired: expiredCount,
      renewalAttempted: renewalResult.attempted,
      renewalSucceeded: renewalResult.succeeded,
      renewalFailed: renewalResult.failed,
    },
    'Renewal: run complete'
  )
}
