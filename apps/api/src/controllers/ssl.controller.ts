import { createFactory } from 'hono/factory'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { acmeService } from '@src/services/acme.service'
import { DomainModel, ChallengeType, DomainType } from '@src/models/domain.model'
import { ApiResponse } from '@src/shared/utils/response'
import type { Env } from '@src/app'

const factory = createFactory<Env>()

/**
 * Validates a fully-qualified domain name with optional wildcard prefix.
 * Accepts: example.com, sub.example.com, *.example.com
 * Rejects: *.*.example.com, -example.com, example (no TLD)
 */
const FQDN_REGEX = /^(\*\.)?([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/

const fqdnField = z
  .string()
  .min(3)
  .max(255)
  .refine((d) => FQDN_REGEX.test(d), {
    message: 'Invalid domain format. Use example.com, sub.example.com, or *.example.com for wildcards.',
  })

const domainSchema = z.object({ domain: fqdnField })

const initiateSchema = z.object({
  domain:        fqdnField,
  challengeType: z.enum([ChallengeType.DNS_01, ChallengeType.HTTP_01]).default(ChallengeType.DNS_01),
})

/**
 * POST /api/ssl/initiate
 * Creates a new ACME order. Returns dns-01 TXT record info or http-01 file
 * challenge info depending on the requested challengeType (default: dns-01).
 * Also clears any stale renewalError from a previously failed auto-renewal.
 */
export const initiateSslHandler = factory.createHandlers(
  zValidator('json', initiateSchema),
  async (c) => {
    const { domain, challengeType } = c.req.valid('json')
    const orgId = c.get('organizationId')
    const email = c.get('userEmail')

    const domainType = domain.startsWith('*.') ? DomainType.WILDCARD : DomainType.SINGLE

    if (domainType === DomainType.WILDCARD && challengeType === ChallengeType.HTTP_01) {
      return ApiResponse.error(
        c,
        'Wildcard certificates require DNS-01 — HTTP-01 is forbidden by RFC 8555.',
        'WILDCARD_HTTP_FORBIDDEN',
        400,
      )
    }

    try {
      const challengeInfo = await acmeService.initiateOrder(domain, orgId, email, challengeType, domainType)
      const msg = challengeType === ChallengeType.HTTP_01
        ? 'Order initiated. Serve the challenge file at the provided URL.'
        : 'Order initiated. Add the TXT record to your DNS.'
      return ApiResponse.success(c, challengeInfo, msg)
    } catch (error: unknown) {
      const err = error as NodeJS.ErrnoException & { code?: number }
      if (err.code === 11000) {
        return ApiResponse.error(c, 'Domain already registered by another organization', 'DOMAIN_CONFLICT', 409)
      }
      return ApiResponse.error(c, (error as Error).message, 'INITIATE_ERROR', 500)
    }
  }
)

const VERIFY_TTL_MS = 5 * 60 * 1000 // 5 minutes between challenge-verify attempts

/**
 * POST /api/ssl/verify
 * Tells Let's Encrypt to validate the DNS/HTTP challenge.
 * Domain must be in `pending_challenge` state.
 * On success transitions domain to `challenge_verified`.
 * TTL: 5 minutes between retries (ACME rate-limits anyway).
 */
export const verifyChallengeHandler = factory.createHandlers(
  zValidator('json', domainSchema),
  async (c) => {
    const { domain } = c.req.valid('json')
    const orgId = c.get('organizationId')
    const email = c.get('userEmail')

    try {
      const domainDoc = await DomainModel.findOne(
        { domainName: domain, organizationId: orgId },
        { _id: 1, status: 1, lastChecked: 1 },
      ).lean()

      if (!domainDoc) {
        return ApiResponse.error(c, 'Domain not found', 'NOT_FOUND', 404)
      }
      if (domainDoc.status !== 'pending_challenge') {
        return ApiResponse.error(
          c,
          `Domain is not awaiting verification (current status: ${domainDoc.status})`,
          'INVALID_STATE',
          409,
        )
      }

      if (domainDoc.lastChecked) {
        const elapsed = Date.now() - domainDoc.lastChecked.getTime()
        if (elapsed < VERIFY_TTL_MS) {
          const timeLeft = Math.ceil((VERIFY_TTL_MS - elapsed) / 1000)
          return ApiResponse.error(
            c,
            `Please wait ${timeLeft} seconds before retrying verification.`,
            'TTL_BLOCK',
            429,
          )
        }
      }

      await DomainModel.updateOne({ _id: domainDoc._id }, { $set: { lastChecked: new Date() } })

      await acmeService.verifyChallenge(domain, orgId, email)
      return ApiResponse.success(c, { status: 'challenge_verified' }, 'Challenge verified. You can now generate the certificate.')
    } catch (error: unknown) {
      return ApiResponse.error(c, (error as Error).message, 'VERIFY_ERROR', 500)
    }
  }
)

/**
 * POST /api/ssl/generate
 * Finalises the ACME order and issues the certificate.
 * Domain must be in `challenge_verified` state.
 * On success transitions domain to `active` and returns cert + key PEM.
 */
export const generateCertHandler = factory.createHandlers(
  zValidator('json', domainSchema),
  async (c) => {
    const { domain } = c.req.valid('json')
    const orgId = c.get('organizationId')
    const email = c.get('userEmail')

    try {
      const domainDoc = await DomainModel.findOne(
        { domainName: domain, organizationId: orgId },
        { status: 1 },
      ).lean()

      if (!domainDoc) {
        return ApiResponse.error(c, 'Domain not found', 'NOT_FOUND', 404)
      }
      if (domainDoc.status !== 'challenge_verified') {
        return ApiResponse.error(
          c,
          `Domain challenge has not been verified yet (current status: ${domainDoc.status})`,
          'INVALID_STATE',
          409,
        )
      }

      const result = await acmeService.generateCertificate(domain, orgId, email)
      return ApiResponse.success(c, result, 'Certificate issued successfully.')
    } catch (error: unknown) {
      return ApiResponse.error(c, (error as Error).message, 'GENERATE_ERROR', 500)
    }
  }
)

/**
 * GET /api/ssl/certificates
 * Lists all domains for the authenticated organisation.
 * Includes renewalError so the admin panel can show the manual-retry banner.
 */
export const listCertificatesHandler = factory.createHandlers(async (c) => {
  const orgId = c.get('organizationId')

  try {
    const domains = await DomainModel.find({ organizationId: orgId })
      .select('domainName status domainType challengeType txtRecordName txtRecordValue httpChallengeToken httpChallengeKeyAuth renewalError lastChecked expiryDate createdAt updatedAt')
      .sort({ createdAt: -1 })
      .lean()

    return ApiResponse.success(c, { certificates: domains }, 'Certificates fetched successfully.')
  } catch (error: unknown) {
    return ApiResponse.error(c, (error as Error).message, 'LIST_ERROR', 500)
  }
})

/**
 * GET /api/ssl/domain/:id
 * Returns the full domain document (including certPem, renewalError, all ACME metadata)
 * for the given domain ID, scoped to the authenticated organisation.
 */
export const getDomainHandler = factory.createHandlers(async (c) => {
  const id = c.req.param('id')
  const orgId = c.get('organizationId')

  try {
    const domain = await DomainModel.findOne({ _id: id, organizationId: orgId }).lean()

    if (!domain) {
      return ApiResponse.error(c, 'Domain not found', 'DOMAIN_NOT_FOUND', 404)
    }

    return ApiResponse.success(c, domain, 'Domain fetched.')
  } catch (error: unknown) {
    return ApiResponse.error(c, (error as Error).message, 'FETCH_ERROR', 500)
  }
})

/**
 * DELETE /api/ssl/domain/:id
 * Deletes a domain document.
 */
export const deleteDomainHandler = factory.createHandlers(async (c) => {
  const id = c.req.param('id')
  const orgId = c.get('organizationId')

  try {
    const domain = await DomainModel.findOneAndDelete({ _id: id, organizationId: orgId })

    if (!domain) {
      return ApiResponse.error(c, 'Domain not found or unauthorized', 'DELETE_ERROR', 404)
    }

    return ApiResponse.success(c, null, 'Domain deleted successfully.')
  } catch (error: unknown) {
    return ApiResponse.error(c, (error as Error).message, 'DELETE_ERROR', 500)
  }
})
