import { logger } from '@src/shared/utils/logger'
import acme from 'acme-client'
import type { Challenge } from 'acme-client/types/rfc8555'
import { X509Certificate } from 'crypto'
import { env } from '@src/shared/config/env'
import { DomainModel, extractRootDomain } from '@src/models/domain.model'
import { CertificateModel, ChallengeType, inferCertType } from '@src/models/certificate.model'
import { OrganizationModel } from '@src/models/organization.model'

// ── Result types ──────────────────────────────────────────────────────────────

export type DnsChallengeResult = {
  challengeType: typeof ChallengeType.DNS_01
  txtName: string
  txtValue: string
}

export type HttpChallengeResult = {
  challengeType: typeof ChallengeType.HTTP_01
  token: string
  keyAuth: string
}

export type InitiateOrderResult = DnsChallengeResult | HttpChallengeResult

// ── Service ───────────────────────────────────────────────────────────────────

export class AcmeService {
  /**
   * Per-org ACME client cache. Settled Promise cache ensures concurrent
   * first-requests for the same org wait on one initialisation.
   */
  private readonly clients = new Map<string, Promise<acme.Client>>()

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
    promise.catch(() => this.clients.delete(orgId))
    return promise
  }

  /**
   * Finds or creates the root Domain record for an org.
   * 'api.idexa.app' → Domain { name: 'idexa.app', organizationId }
   */
  private async findOrCreateDomain(certName: string, orgId: string) {
    const rootName = extractRootDomain(certName)
    const domain = await DomainModel.findOneAndUpdate(
      { name: rootName, organizationId: orgId },
      { $setOnInsert: { name: rootName, organizationId: orgId } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    )
    return domain!
  }

  /**
   * Step 1 — Creates a new ACME order for a certificate.
   * Finds (or creates) the root Domain, then upserts a Certificate record
   * with challenge details the user must act on.
   */
  async initiateOrder(
    certName: string,
    orgId: string,
    email: string,
    challengeType: ChallengeType = ChallengeType.DNS_01,
  ): Promise<InitiateOrderResult> {
    logger.info({ certName, orgId, challengeType }, 'ACME: initiating order')

    const domain = await this.findOrCreateDomain(certName, orgId)
    const client = await this.getClient(orgId, email)

    const order = await client.createOrder({
      identifiers: [{ type: 'dns', value: certName }],
    })

    const authorizations = await client.getAuthorizations(order)
    if (!authorizations.length || !authorizations[0]?.challenges?.length) {
      throw new Error(`ACME returned no authorizations for ${certName}`)
    }

    const challenge = authorizations[0].challenges.find((c) => c.type === challengeType)
    if (!challenge) {
      throw new Error(`${challengeType} challenge not available for ${certName}`)
    }

    const keyAuth = await client.getChallengeKeyAuthorization(challenge)
    const certType = inferCertType(certName)

    const baseUpdate = {
      status: 'pending_challenge' as const,
      certType,
      challengeType,
      domainId:     domain._id,
      organizationId: orgId,
      acmeOrderUrl:     order.url,
      acmeChallengeUrl: challenge.url,
    }

    if (challengeType === ChallengeType.DNS_01) {
      // RFC 8555 §8.4: wildcard orders use the base domain without the '*.' prefix
      const base = certName.startsWith('*.') ? certName.slice(2) : certName
      const txtName = `_acme-challenge.${base}`

      await CertificateModel.updateOne(
        { certName, organizationId: orgId },
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
            coveredByWildcardId:  1,
          },
        },
        { upsert: true },
      )

      logger.info({ certName, orgId }, 'ACME: dns-01 order initiated')
      return { challengeType: ChallengeType.DNS_01, txtName, txtValue: keyAuth }
    }

    // HTTP-01
    await CertificateModel.updateOne(
      { certName, organizationId: orgId },
      {
        $set: {
          ...baseUpdate,
          httpChallengeToken:   challenge.token,
          httpChallengeKeyAuth: keyAuth,
        },
        $unset: {
          txtRecordName:       1,
          txtRecordValue:      1,
          renewalError:        1,
          renewalFailedAt:     1,
          coveredByWildcardId: 1,
        },
      },
      { upsert: true },
    )

    logger.info({ certName, orgId }, 'ACME: http-01 order initiated')
    return { challengeType: ChallengeType.HTTP_01, token: challenge.token, keyAuth }
  }

  /**
   * Step 2 — Completes the stored ACME challenge.
   * Sets certificate status to `challenge_verified`.
   */
  async verifyChallenge(certName: string, orgId: string, email: string): Promise<void> {
    logger.info({ certName, orgId }, 'ACME: verifying challenge')

    const cert = await CertificateModel.findOne(
      { certName, organizationId: orgId },
      { status: 1, acmeOrderUrl: 1, challengeType: 1 },
    ).lean()

    if (!cert?.acmeOrderUrl) {
      throw new Error('No pending order found. Call initiateOrder first.')
    }
    if (cert.status !== 'pending_challenge') {
      throw new Error(`Invalid state: expected pending_challenge, got ${cert.status}`)
    }

    const resolvedType = cert.challengeType ?? ChallengeType.DNS_01
    const client = await this.getClient(orgId, email)

    const order = await client.getOrder(
      { url: cert.acmeOrderUrl } as Parameters<typeof client.getOrder>[0],
    )
    const authorizations = await client.getAuthorizations(order)
    if (!authorizations.length || !authorizations[0]?.challenges?.length) {
      throw new Error(`ACME returned no authorizations for ${certName}`)
    }

    const found = authorizations[0].challenges.find((c) => c.type === resolvedType)
    if (!found) throw new Error(`${resolvedType} challenge not found in authorizations`)

    let challenge: Challenge = found

    if (challenge.status === 'pending') {
      logger.info({ certName, resolvedType }, "ACME: notifying Let's Encrypt")
      challenge = (await client.completeChallenge(challenge)) as Challenge
    }

    logger.info({ certName }, 'ACME: polling for valid status…')
    challenge = (await client.waitForValidStatus(challenge)) as Challenge

    if (challenge.status !== 'valid') {
      throw new Error(`Challenge failed with status: ${challenge.status}`)
    }

    await CertificateModel.updateOne(
      { certName, organizationId: orgId },
      { $set: { status: 'challenge_verified' } },
    )

    logger.info({ certName, orgId }, 'ACME: challenge verified')
  }

  /**
   * Step 3 — Finalises the ACME order, issues the certificate, clears ACME fields.
   */
  async generateCertificate(certName: string, orgId: string, email: string): Promise<{ cert: string; key: string }> {
    logger.info({ certName, orgId }, 'ACME: generating certificate')

    const certDoc = await CertificateModel.findOne(
      { certName, organizationId: orgId },
      { status: 1, acmeOrderUrl: 1 },
    ).lean()

    if (!certDoc?.acmeOrderUrl) throw new Error('No verified order found.')
    if (certDoc.status !== 'challenge_verified') {
      throw new Error(`Invalid state: expected challenge_verified, got ${certDoc.status}`)
    }

    const client = await this.getClient(orgId, email)
    const order = await client.getOrder(
      { url: certDoc.acmeOrderUrl } as Parameters<typeof client.getOrder>[0],
    )

    const certKey = await acme.crypto.createPrivateKey()
    const [, csr] = await acme.crypto.createCsr({ commonName: certName }, certKey)
    const finalizedOrder = await client.finalizeOrder(order, csr)
    const certPem = (await client.getCertificate(finalizedOrder)).toString()
    const expiryDate = new Date(new X509Certificate(certPem).validTo)

    await CertificateModel.updateOne(
      { certName, organizationId: orgId },
      {
        $set: {
          status: 'active',
          certPem,
          keyPem: certKey.toString(),
          expiryDate,
          issuedAt: new Date(),
        },
        $unset: {
          acmeOrderUrl:        1,
          acmeChallengeUrl:    1,
          txtRecordName:       1,
          txtRecordValue:      1,
          httpChallengeToken:  1,
          httpChallengeKeyAuth:1,
        },
      },
    )

    logger.info({ certName, orgId, expiryDate }, 'ACME: certificate issued')
    return { cert: certPem, key: certKey.toString() }
  }

  /**
   * Instant activation by adopting an existing active wildcard certificate.
   * Creates (or finds) the root Domain, creates a Certificate record with
   * the wildcard's PEM copied in — no ACME order needed.
   */
  async adoptWildcard(
    certName: string,
    orgId: string,
    wildcardCertId: string,
  ): Promise<{ cert: string; key: string }> {
    logger.info({ certName, orgId, wildcardCertId }, 'ACME: adopting wildcard cert')

    const wildcard = await CertificateModel.findOne(
      { _id: wildcardCertId, organizationId: orgId, status: 'active' },
      { certPem: 1, keyPem: 1, expiryDate: 1 },
    ).lean()

    if (!wildcard)          throw new Error('Wildcard certificate not found or not active.')
    if (!wildcard.certPem)  throw new Error('Wildcard has no certificate PEM stored.')
    if (!wildcard.keyPem)   throw new Error('Wildcard has no private key stored.')
    if (wildcard.expiryDate && wildcard.expiryDate < new Date()) {
      throw new Error('Wildcard certificate has expired.')
    }

    const domain = await this.findOrCreateDomain(certName, orgId)

    await CertificateModel.updateOne(
      { certName, organizationId: orgId },
      {
        $set: {
          domainId:            domain._id,
          organizationId:      orgId,
          certType:            inferCertType(certName),
          status:              'active',
          coveredByWildcardId: wildcard._id,
          certPem:             wildcard.certPem,
          keyPem:              wildcard.keyPem,
          expiryDate:          wildcard.expiryDate,
          issuedAt:            new Date(),
        },
        $unset: {
          challengeType:       1,
          acmeOrderUrl:        1,
          acmeChallengeUrl:    1,
          txtRecordName:       1,
          txtRecordValue:      1,
          httpChallengeToken:  1,
          httpChallengeKeyAuth:1,
          renewalError:        1,
          renewalFailedAt:     1,
        },
      },
      { upsert: true },
    )

    logger.info({ certName, orgId }, 'ACME: wildcard adopted')
    return { cert: wildcard.certPem, key: wildcard.keyPem }
  }
}

export const acmeService = new AcmeService()
