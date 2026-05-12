import { logger } from '@src/shared/utils/logger'
import acme from 'acme-client'
import type { DnsChallenge } from 'acme-client/types/rfc8555'
import { env } from '@src/shared/config/env'
import { DomainModel } from '@src/models/domain.model'
import { OrganizationModel } from '@src/models/organization.model'

export class AcmeService {
  /**
   * Per-org ACME client cache.
   * Key = orgId. Value = settled Promise<acme.Client>.
   * Using a Promise cache means concurrent first-requests for the same org
   * wait on the same initialisation, never creating duplicate accounts.
   */
  private readonly clients = new Map<string, Promise<acme.Client>>()

  /**
   * Returns (or lazily creates) the ACME client for an organisation.
   *
   * Key lifecycle:
   *   1. Check org doc for stored base64-PEM account key.
   *   2. If absent: generate, persist, proceed.
   *   3. Call createAccount — idempotent on Let's Encrypt.
   *   4. Cache client for the lifetime of this process.
   */
  private getClient(orgId: string, email: string): Promise<acme.Client> {
    const cached = this.clients.get(orgId)
    if (cached) return cached

    const promise = (async (): Promise<acme.Client> => {
      const org = await OrganizationModel.findById(orgId)
      if (!org) throw new Error(`Organisation ${orgId} not found`)

      let accountKey: Buffer

      if (org.acmeAccountKey) {
        accountKey = Buffer.from(org.acmeAccountKey, 'base64')
        logger.info({ orgId }, 'ACME: loaded account key from DB')
      } else {
        accountKey = await acme.crypto.createPrivateKey()
        await OrganizationModel.findByIdAndUpdate(orgId, {
          acmeAccountKey: accountKey.toString('base64'),
        })
        logger.info({ orgId }, 'ACME: generated and persisted new account key')
      }

      const client = new acme.Client({
        directoryUrl: env.ACME_STAGING
          ? acme.directory.letsencrypt.staging
          : acme.directory.letsencrypt.production,
        accountKey,
      })

      await client.createAccount({
        termsOfServiceAgreed: true,
        contact: [`mailto:${email}`],
      })

      logger.info({ orgId, staging: env.ACME_STAGING }, 'ACME: client ready')
      return client
    })()

    this.clients.set(orgId, promise)

    // On failure, evict from cache so the next call retries cleanly
    promise.catch(() => this.clients.delete(orgId))

    return promise
  }

  async initiateOrder(domain: string, orgId: string, email: string) {
    logger.info({ domain, orgId }, 'ACME: initiating order')

    const client = await this.getClient(orgId, email)

    const order = await client.createOrder({
      identifiers: [{ type: 'dns', value: domain }],
    })

    const authorizations = await client.getAuthorizations(order)
    const challenge = authorizations[0].challenges.find((c) => c.type === 'dns-01')

    if (!challenge) throw new Error('DNS-01 challenge not found in ACME authorizations')

    const keyAuth = await client.getChallengeKeyAuthorization(challenge)
    const txtName = `_acme-challenge.${domain}`

    await DomainModel.findOneAndUpdate(
      { domainName: domain, organizationId: orgId },
      {
        $set: {
          status: 'pending_challenge',
          acmeOrderUrl: order.url,
          acmeChallengeUrl: challenge.url,
          txtRecordName: txtName,
          txtRecordValue: keyAuth,
        },
      },
      { upsert: true, new: true }
    )

    logger.info({ domain, orgId }, 'ACME: order initiated — waiting for DNS record')
    return { txtName, txtValue: keyAuth }
  }

  async verifyAndIssue(domain: string, orgId: string, email: string) {
    logger.info({ domain, orgId }, 'ACME: verifying DNS challenge')

    const domainDoc = await DomainModel.findOne({ domainName: domain, organizationId: orgId })
    if (!domainDoc?.acmeOrderUrl) {
      throw new Error('No pending order found. Call initiateOrder first.')
    }

    const client = await this.getClient(orgId, email)

    // Reconstruct the order object from the stored URL
    const order = await client.getOrder({ url: domainDoc.acmeOrderUrl } as Parameters<typeof client.getOrder>[0])

    const authorizations = await client.getAuthorizations(order)
    const foundChallenge = authorizations[0].challenges.find((c) => c.type === 'dns-01') as DnsChallenge | undefined
    if (!foundChallenge) throw new Error('DNS-01 challenge not found in ACME authorizations')

    let challenge: DnsChallenge = foundChallenge

    if (challenge.status === 'pending') {
      logger.info({ domain }, 'ACME: notifying Let\'s Encrypt to verify challenge')
      challenge = (await client.completeChallenge(challenge)) as DnsChallenge
    }

    logger.info({ domain }, 'ACME: polling for valid status…')
    challenge = (await client.waitForValidStatus(challenge)) as DnsChallenge

    if (challenge.status !== 'valid') {
      throw new Error(`Challenge verification failed with status: ${challenge.status}`)
    }

    const certKey = await acme.crypto.createPrivateKey()
    const [, csr] = await acme.crypto.createCsr({ commonName: domain }, certKey)
    const finalizedOrder = await client.finalizeOrder(order, csr)
    const cert = await client.getCertificate(finalizedOrder)

    await DomainModel.findOneAndUpdate(
      { domainName: domain, organizationId: orgId },
      { status: 'active' }
    )

    logger.info({ domain, orgId }, 'ACME: certificate issued')
    return { cert: cert.toString(), key: certKey.toString() }
  }
}

export const acmeService = new AcmeService()
