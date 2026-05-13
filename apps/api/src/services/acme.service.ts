import { logger } from '@src/shared/utils/logger'
import acme from 'acme-client'
import type { Challenge } from 'acme-client/types/rfc8555'
import { X509Certificate } from 'crypto'
import { env } from '@src/shared/config/env'
import { DomainModel, ChallengeType, DomainType } from '@src/models/domain.model'
import { OrganizationModel } from '@src/models/organization.model'

// ── Result types ──────────────────────────────────────────────────────────────

export type DnsChallengeResult = {
  challengeType: typeof ChallengeType.DNS_01
  txtName: string
  txtValue: string
}

export type HttpChallengeResult = {
  challengeType: typeof ChallengeType.HTTP_01
  /** ACME challenge token — final URL path segment. */
  token: string
  /** Exact content to serve at the challenge URL. */
  keyAuth: string
}

export type InitiateOrderResult = DnsChallengeResult | HttpChallengeResult

// ── Service ───────────────────────────────────────────────────────────────────

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

    // On failure, evict so the next call retries cleanly
    promise.catch(() => this.clients.delete(orgId))

    return promise
  }

  /**
   * Creates a new ACME order and returns the challenge info the user must
   * act on (DNS TXT record for dns-01, HTTP file for http-01).
   *
   * Stores all challenge fields on the domain document so `verifyAndIssue`
   * can reconstruct and complete the challenge without extra inputs.
   */
  async initiateOrder(
    domain: string,
    orgId: string,
    email: string,
    challengeType: ChallengeType = ChallengeType.DNS_01,
    domainType: DomainType = DomainType.SINGLE,
  ): Promise<InitiateOrderResult> {
    logger.info({ domain, orgId, challengeType }, 'ACME: initiating order')

    const client = await this.getClient(orgId, email)

    const order = await client.createOrder({
      identifiers: [{ type: 'dns', value: domain }],
    })

    const authorizations = await client.getAuthorizations(order)
    if (!authorizations.length || !authorizations[0]?.challenges?.length) {
      throw new Error(`ACME returned no authorizations or challenges for ${domain}`)
    }

    const challenge = authorizations[0].challenges.find((c) => c.type === challengeType)
    if (!challenge) {
      throw new Error(`${challengeType} challenge not available for ${domain}`)
    }

    const keyAuth = await client.getChallengeKeyAuthorization(challenge)

    const baseUpdate = {
      status: 'pending_challenge' as const,
      domainType,
      challengeType,
      acmeOrderUrl: order.url,
      acmeChallengeUrl: challenge.url,
    }

    if (challengeType === ChallengeType.DNS_01) {
      // RFC 8555 §8.4: wildcard orders use the base domain without the '*.' prefix
      const baseDomain = domain.startsWith('*.') ? domain.slice(2) : domain
      const txtName = `_acme-challenge.${baseDomain}`

      await DomainModel.updateOne(
        { domainName: domain, organizationId: orgId },
        {
          $set: {
            ...baseUpdate,
            txtRecordName:  txtName,
            txtRecordValue: keyAuth,
          },
          $unset: {
            httpChallengeToken:   1,
            httpChallengeKeyAuth: 1,
            renewalError:         1,
            renewalFailedAt:      1,
          },
        },
        { upsert: true },
      )

      logger.info({ domain, orgId }, 'ACME: dns-01 order initiated')
      return { challengeType: ChallengeType.DNS_01, txtName, txtValue: keyAuth }
    }

    // HTTP-01
    const token = challenge.token

    await DomainModel.updateOne(
      { domainName: domain, organizationId: orgId },
      {
        $set: {
          ...baseUpdate,
          httpChallengeToken:   token,
          httpChallengeKeyAuth: keyAuth,
        },
        $unset: {
          txtRecordName:  1,
          txtRecordValue: 1,
          renewalError:   1,
          renewalFailedAt: 1,
        },
      },
      { upsert: true },
    )

    logger.info({ domain, orgId }, 'ACME: http-01 order initiated')
    return { challengeType: ChallengeType.HTTP_01, token, keyAuth }
  }

  /**
   * Step 2 — Completes the stored ACME challenge and waits for Let's Encrypt
   * to mark it valid. Sets domain status to `challenge_verified`.
   * The user must then call `generateCertificate` to finalise the order.
   */
  async verifyChallenge(domain: string, orgId: string, email: string): Promise<void> {
    logger.info({ domain, orgId }, 'ACME: verifying challenge')

    const domainDoc = await DomainModel.findOne(
      { domainName: domain, organizationId: orgId },
      { status: 1, acmeOrderUrl: 1, challengeType: 1 },
    ).lean()

    if (!domainDoc?.acmeOrderUrl) {
      throw new Error('No pending order found. Call initiateOrder first.')
    }
    if (domainDoc.status !== 'pending_challenge') {
      throw new Error(`Invalid state: expected pending_challenge, got ${domainDoc.status}`)
    }

    const resolvedChallengeType = domainDoc.challengeType ?? ChallengeType.DNS_01
    const client = await this.getClient(orgId, email)

    const order = await client.getOrder(
      { url: domainDoc.acmeOrderUrl } as Parameters<typeof client.getOrder>[0],
    )

    const authorizations = await client.getAuthorizations(order)
    if (!authorizations.length || !authorizations[0]?.challenges?.length) {
      throw new Error(`ACME returned no authorizations or challenges for ${domain}`)
    }

    const found = authorizations[0].challenges.find((c) => c.type === resolvedChallengeType)
    if (!found) {
      throw new Error(`${resolvedChallengeType} challenge not found in authorizations`)
    }

    let challenge: Challenge = found

    if (challenge.status === 'pending') {
      logger.info({ domain, resolvedChallengeType }, "ACME: notifying Let's Encrypt to verify challenge")
      challenge = (await client.completeChallenge(challenge)) as Challenge
    }

    logger.info({ domain }, 'ACME: polling for valid status…')
    challenge = (await client.waitForValidStatus(challenge)) as Challenge

    if (challenge.status !== 'valid') {
      throw new Error(`Challenge verification failed with status: ${challenge.status}`)
    }

    await DomainModel.updateOne(
      { domainName: domain, organizationId: orgId },
      { $set: { status: 'challenge_verified' } },
    )

    logger.info({ domain, orgId }, 'ACME: challenge verified — ready to generate certificate')
  }

  /**
   * Step 3 — Finalises the ACME order and issues the certificate.
   * Domain must be in `challenge_verified` state.
   * Sets domain status to `active` and persists cert + key PEM.
   */
  async generateCertificate(domain: string, orgId: string, email: string): Promise<{ cert: string; key: string }> {
    logger.info({ domain, orgId }, 'ACME: generating certificate')

    const domainDoc = await DomainModel.findOne(
      { domainName: domain, organizationId: orgId },
      { status: 1, acmeOrderUrl: 1 },
    ).lean()

    if (!domainDoc?.acmeOrderUrl) {
      throw new Error('No verified order found. Call verifyChallenge first.')
    }
    if (domainDoc.status !== 'challenge_verified') {
      throw new Error(`Invalid state: expected challenge_verified, got ${domainDoc.status}`)
    }

    const client = await this.getClient(orgId, email)

    const order = await client.getOrder(
      { url: domainDoc.acmeOrderUrl } as Parameters<typeof client.getOrder>[0],
    )

    const certKey = await acme.crypto.createPrivateKey()
    const [, csr] = await acme.crypto.createCsr({ commonName: domain }, certKey)
    const finalizedOrder = await client.finalizeOrder(order, csr)
    const cert = await client.getCertificate(finalizedOrder)

    const certStr = cert.toString()
    const expiryDate = new Date(new X509Certificate(certStr).validTo)

    await DomainModel.updateOne(
      { domainName: domain, organizationId: orgId },
      { $set: { status: 'active', expiryDate, certPem: certStr, keyPem: certKey.toString() } },
    )

    logger.info({ domain, orgId, expiryDate }, 'ACME: certificate issued')
    return { cert: certStr, key: certKey.toString() }
  }
}

export const acmeService = new AcmeService()
