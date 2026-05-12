import { Cron } from 'croner'
import { checkAndRenewExpiring } from '@src/services/renewal.service'
import { logger } from '@src/shared/utils/logger'

let job: Cron | null = null

export function startRenewalJob(): void {
  job = new Cron(
    '0 3 * * *',
    {
      protect: true,
      name: 'ssl-renewal',
      catch: (err: unknown) => {
        logger.error({ err }, 'Renewal job: unhandled error')
      },
    },
    async () => {
      logger.info('Renewal job: starting expiry check')
      await checkAndRenewExpiring()
      logger.info('Renewal job: complete')
    }
  )

  logger.info('Renewal job: scheduled (daily at 03:00, no-parallel guard active)')
}

export function stopRenewalJob(): void {
  job?.stop()
  job = null
  logger.info('Renewal job: stopped')
}
