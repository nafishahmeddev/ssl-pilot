import { logger } from '@src/shared/utils/logger'
import acme from 'acme-client'
import { env } from '@src/shared/config/env'
import { DomainModel } from '@src/models/domain.model'
import { promisify } from 'util'

const sleep = promisify(setTimeout)

export class AcmeService {
  /**
   * Cached client promise — ensures only one client is ever created per
   * service instance, so initiateOrder and verifyAndIssue always share the
   * same ACME account and can therefore see each other's orders.
   */
  private clientPromise: Promise<acme.Client> | null = null

  /**
   * Lazily initialise and cache the ACME client.
   *
   * Key persistence strategy:
   *   - If ACME_ACCOUNT_KEY is in env (base64-encoded PEM), reuse it.
   *     Orders survive server restarts.
   *   - Otherwise generate a fresh key, log it as a warning so the operator
   *     can persist it.  Orders are lost on restart, but the service still works.
   */
  private getClient(): Promise<acme.Client> {
    if (this.clientPromise) return this.clientPromise

    this.clientPromise = (async () => {
      let accountKey: Buffer

      if (env.ACME_ACCOUNT_KEY) {
        accountKey = Buffer.from(env.ACME_ACCOUNT_KEY, 'base64')
        logger.info('Loaded ACME account key from ACME_ACCOUNT_KEY env var')
      } else {
        accountKey = await acme.crypto.createPrivateKey()
        logger.warn(
          { ACME_ACCOUNT_KEY: accountKey.toString('base64') },
          'No ACME_ACCOUNT_KEY set — generated ephemeral key. ' +
          'Copy the value above into ACME_ACCOUNT_KEY to persist it across restarts.'
        )
      }

      const client = new acme.Client({
        directoryUrl: env.ACME_STAGING
          ? acme.directory.letsencrypt.staging
          : acme.directory.letsencrypt.production,
        accountKey,
      })

      // Register / retrieve the account — idempotent on Let's Encrypt
      await client.createAccount({
        termsOfServiceAgreed: true,
        contact: [`mailto:${env.ACME_EMAIL}`],
      })

      logger.info({ staging: env.ACME_STAGING }, 'ACME client ready')
      return client
    })()

    return this.clientPromise
  }

  async initiateOrder(domain: string) {
    logger.info({ domain }, 'Initiating ACME order')

    try {
      const client = await this.getClient()

      const order = await client.createOrder({
        identifiers: [{ type: 'dns', value: domain }],
      })

      const authorizations = await client.getAuthorizations(order)
      const challenge = authorizations[0].challenges.find((c) => c.type === 'dns-01')

      if (!challenge) {
        throw new Error('DNS-01 challenge not found in ACME authorizations')
      }

      const keyAuth = await client.getChallengeKeyAuthorization(challenge)
      const txtName = `_acme-challenge.${domain}`

      await DomainModel.findOneAndUpdate(
        { domainName: domain },
        {
          status: 'pending_challenge',
          acmeOrderUrl: order.url,
          acmeChallengeUrl: challenge.url,
          txtRecordName: txtName,
          txtRecordValue: keyAuth,
        },
        { upsert: true }
      )

      logger.info({ domain }, 'ACME order initiated — waiting for user DNS record')

      return { txtName, txtValue: keyAuth }
    } catch (error) {
      logger.error(error, `Failed to initiate ACME order for ${domain}`)
      throw error
    }
  }

  async verifyAndIssue(domain: string) {
    logger.info({ domain }, 'Verifying DNS challenge and issuing certificate')

    try {
      const domainDoc = await DomainModel.findOne({ domainName: domain })
      if (!domainDoc?.acmeOrderUrl) {
        throw new Error('No pending order found for this domain. Call initiateOrder first.')
      }

      // Same client instance as initiateOrder — same account key
      const client = await this.getClient()

      const order = await client.getOrder({ url: domainDoc.acmeOrderUrl } as Parameters<typeof client.getOrder>[0])

      const authorizations = await client.getAuthorizations(order)
      let challenge = authorizations[0].challenges.find((c) => c.type === 'dns-01') as acme.Challenge

      if (!challenge) {
        throw new Error('DNS-01 challenge not found in ACME authorizations')
      }

      if (challenge.status === 'pending') {
        logger.info({ domain }, 'Notifying Let\'s Encrypt to verify the challenge')
        challenge = await client.completeChallenge(challenge)
      }

      logger.info({ domain }, 'Polling challenge status…')
      challenge = await client.waitForValidStatus(challenge)

      if (challenge.status !== 'valid') {
        throw new Error(`Challenge verification failed with status: ${challenge.status}`)
      }

      const certKey = await acme.crypto.createPrivateKey()
      const [, csr] = await acme.crypto.createCsr({ commonName: domain }, certKey)
      const finalizedOrder = await client.finalizeOrder(order, csr)
      const cert = await client.getCertificate(finalizedOrder)

      await DomainModel.findOneAndUpdate({ domainName: domain }, { status: 'active' })

      logger.info({ domain }, 'Certificate issued successfully')

      return { cert: cert.toString(), key: certKey.toString() }
    } catch (error) {
      logger.error(error, `Failed to verify and issue certificate for ${domain}`)
      throw error
    }
  }
}

export const acmeService = new AcmeService()

// Eagerly warm up the ACME client on startup so the first user request is fast
acmeService['getClient']().catch((err) =>
  logger.error(err, 'ACME client init failed on startup')
)
