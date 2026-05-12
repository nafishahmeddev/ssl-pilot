import { Types } from 'mongoose'
import { DomainModel } from '@src/models/domain.model'
import { UserModel } from '@src/models/user.model'
import { acmeService } from '@src/services/acme.service'
import { logger } from '@src/shared/utils/logger'

const RENEW_WINDOW_DAYS = 30

export async function checkAndRenewExpiring(): Promise<void> {
  const threshold = new Date(Date.now() + RENEW_WINDOW_DAYS * 24 * 60 * 60 * 1000)

  const expiring = await DomainModel.find({
    status: 'active',
    expiryDate: { $lte: threshold, $gt: new Date() },
  }).lean()

  if (expiring.length === 0) {
    logger.info('Renewal: no certificates expiring within 30 days')
    return
  }

  logger.info({ count: expiring.length }, 'Renewal: initiating orders for expiring certificates')

  for (const domain of expiring) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const admin = await UserModel.findOne({
        organizationId: new Types.ObjectId(domain.organizationId) as any,
        role: 'admin',
      }).lean()

      if (!admin) {
        logger.warn({ domain: domain.domainName }, 'Renewal: no admin user found for org, skipping')
        continue
      }

      await acmeService.initiateOrder(
        domain.domainName,
        domain.organizationId.toString(),
        admin.email
      )

      logger.info({ domain: domain.domainName }, 'Renewal: new ACME order initiated — DNS update required')
    } catch (err) {
      logger.error({ err, domain: domain.domainName }, 'Renewal: failed to initiate order')
    }
  }
}
