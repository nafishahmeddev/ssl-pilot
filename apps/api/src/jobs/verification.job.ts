import { Cron } from 'croner'
import { DomainModel } from '@src/models/domain.model'
import { UserModel } from '@src/models/user.model'
import { acmeService } from '@src/services/acme.service'
import { logger } from '@src/shared/utils/logger'
import { Types } from 'mongoose'

let job: Cron | null = null

/**
 * Starts the SSL verification cron job.
 * Runs every 10 minutes to check for pending challenges.
 */
export function startVerificationJob(): void {
  job = new Cron(
    '*/10 * * * *',
    {
      name: 'ssl-verification',
      protect: true,
      catch: (err: unknown) => {
        logger.error({ err }, 'Verification job: unhandled error in cron handler')
      },
    },
    async () => {
      logger.info('Verification job: tick started')
      await checkAndVerifyPending()
      logger.info('Verification job: tick complete')
    }
  )

  logger.info(
    { schedule: '*/10 * * * *', protect: true },
    'Verification job: scheduled — every 10 minutes'
  )
}

/**
 * Stops the verification cron job.
 */
export function stopVerificationJob(): void {
  if (job) {
    job.stop()
    job = null
    logger.info('Verification job: stopped')
  }
}

/**
 * Finds all domains in 'pending_challenge' state and attempts to verify them.
 * Respects a 5-minute TTL between attempts.
 */
async function checkAndVerifyPending(): Promise<void> {
  const TTL = 5 * 60 * 1000 // 5 minutes
  const ttlEdge = new Date(Date.now() - TTL)

  const pending = await DomainModel.find({
    status: 'pending_challenge',
    $or: [
      { lastChecked: { $exists: false } },
      { lastChecked: { $lt: ttlEdge } },
    ],
  })
  
  if (pending.length === 0) {
    logger.info('Verification job: no pending challenges to verify')
    return
  }

  for (const domain of pending) {
    const log = logger.child({ domain: domain.domainName, orgId: domain.organizationId.toString() })

    try {

      const admin = await UserModel.findOne({
        organizationId: new Types.ObjectId(domain.organizationId),
        role: 'admin',
      }).lean()

      if (!admin) {
        log.warn('Verification job: no admin user found for org — skipping')
        continue
      }

      // Update lastChecked immediately with a lock condition to prevent race conditions
      const updateResult = await DomainModel.updateOne(
        {
          _id: domain._id,
          status: 'pending_challenge',
          $or: [
            { lastChecked: { $exists: false } },
            { lastChecked: { $lt: ttlEdge } },
          ],
        },
        { $set: { lastChecked: new Date() } }
      )

      if (updateResult.modifiedCount === 0) {
        log.info('Verification job: skipping, already picked up by another process or status changed')
        continue
      }

      log.info('Verification job: attempting verification')
      await acmeService.verifyAndIssue(
        domain.domainName,
        domain.organizationId.toString(),
        admin.email
      )
      log.info('Verification job: verification successful')
    } catch (err) {
      log.error({ err }, 'Verification job: failed to verify domain')
    }
  }
}
