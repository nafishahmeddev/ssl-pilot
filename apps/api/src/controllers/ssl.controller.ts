import { createFactory } from 'hono/factory'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { acmeService } from '@src/services/acme.service'
import { DomainModel } from '@src/models/domain.model'
import { ApiResponse } from '@src/shared/utils/response'
import type { Env } from '@src/app'

const factory = createFactory<Env>()

const domainSchema = z.object({
  domain: z.string().min(3).max(255),
})

/**
 * POST /api/ssl/initiate
 * Creates a new ACME order for the given domain. Returns DNS TXT challenge info.
 * Also clears any stale renewalError from a previously failed auto-renewal.
 */
export const initiateSslHandler = factory.createHandlers(
  zValidator('json', domainSchema),
  async (c) => {
    const { domain } = c.req.valid('json')
    const orgId = c.get('organizationId')
    const email = c.get('userEmail')

    try {
      const challengeInfo = await acmeService.initiateOrder(domain, orgId, email)
      return ApiResponse.success(c, challengeInfo, 'Order initiated. Add the TXT record to your DNS.')
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
      .select('domainName status txtRecordName txtRecordValue renewalError expiryDate createdAt updatedAt')
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
