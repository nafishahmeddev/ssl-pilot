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

/**
 * POST /api/ssl/verify
 * Completes the ACME DNS-01 challenge and issues the certificate.
 */
export const verifySslHandler = factory.createHandlers(
  zValidator('json', domainSchema),
  async (c) => {
    const { domain } = c.req.valid('json')
    const orgId = c.get('organizationId')
    const email = c.get('userEmail')

    try {
      const result = await acmeService.verifyAndIssue(domain, orgId, email)
      return ApiResponse.success(c, result, 'Certificate issued successfully.')
    } catch (error: unknown) {
      return ApiResponse.error(c, (error as Error).message, 'VERIFY_ERROR', 500)
    }
  }
)

/**
 * POST /api/ssl/recheck
 * Re-attempts ACME verification on an existing pending_challenge domain.
 * Identical logic to /verify but semantically distinct for UX clarity.
 */
export const recheckHandler = factory.createHandlers(
  zValidator('json', domainSchema),
  async (c) => {
    const { domain } = c.req.valid('json')
    const orgId = c.get('organizationId')
    const email = c.get('userEmail')

    try {
      const domainDoc = await DomainModel.findOne({ domainName: domain, organizationId: orgId })
      if (!domainDoc) {
        return ApiResponse.error(c, 'Domain not found', 'NOT_FOUND', 404)
      }

      const TTL = 5 * 60 * 1000 // 5 minutes
      if (domainDoc.lastChecked && (Date.now() - domainDoc.lastChecked.getTime() < TTL)) {
        const timeLeft = Math.ceil((TTL - (Date.now() - domainDoc.lastChecked.getTime())) / 1000)
        return ApiResponse.error(c, `Please wait ${timeLeft} seconds before retrying verification.`, 'TTL_BLOCK', 429)
      }

      // Update lastChecked immediately to prevent concurrent attempts
      await DomainModel.updateOne({ _id: domainDoc._id }, { $set: { lastChecked: new Date() } })

      const result = await acmeService.verifyAndIssue(domain, orgId, email)
      return ApiResponse.success(c, result, 'Certificate issued successfully.')
    } catch (error: unknown) {
      return ApiResponse.error(c, (error as Error).message, 'RECHECK_ERROR', 500)
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
