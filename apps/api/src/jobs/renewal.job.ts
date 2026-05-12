/**
 * renewal.job.ts
 *
 * Schedules the SSL certificate renewal cron job using croner.
 *
 * Schedule: daily at 03:00 (server local time).
 * Guard:    `protect: true` — skips a tick if the previous run is still in progress.
 * Errors:   caught by the croner `catch` hook and logged; never crash the process.
 *
 * Lifecycle:
 *   - Call `startRenewalJob()` once after the database connection is established.
 *   - Call `stopRenewalJob()` during graceful shutdown before closing the server.
 */

import { Cron } from 'croner'
import { checkAndRenewExpired } from '@src/services/renewal.service'
import { logger } from '@src/shared/utils/logger'

/** Holds the active croner instance so it can be stopped on shutdown. */
let job: Cron | null = null

/**
 * Starts the SSL renewal cron job.
 *
 * Safe to call only once per process. Subsequent calls are no-ops because
 * the previous `job` reference would be replaced without stopping the old one.
 */
export function startRenewalJob(): void {
  job = new Cron(
    '0 3 * * *',
    {
      name: 'ssl-renewal',
      protect: true, // Prevents overlapping runs if a tick takes longer than 24h
      catch: (err: unknown) => {
        logger.error({ err }, 'Renewal job: unhandled error in cron handler')
      },
    },
    async () => {
      logger.info('Renewal job: tick started')
      await checkAndRenewExpired()
      logger.info('Renewal job: tick complete')
    }
  )

  logger.info(
    { schedule: '0 3 * * *', protect: true },
    'Renewal job: scheduled — daily at 03:00, overlapping runs blocked'
  )
}

/**
 * Stops the renewal cron job and clears the reference.
 * Called during graceful shutdown to prevent in-flight ticks after server close.
 */
export function stopRenewalJob(): void {
  if (job) {
    job.stop()
    job = null
    logger.info('Renewal job: stopped')
  }
}
