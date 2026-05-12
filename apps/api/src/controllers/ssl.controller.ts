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

export const listCertificatesHandler = factory.createHandlers(async (c) => {
  const orgId = c.get('organizationId')

  try {
    const domains = await DomainModel.find({ organizationId: orgId })
      .select('domainName status txtRecordName txtRecordValue expiryDate createdAt updatedAt')
      .sort({ createdAt: -1 })
      .lean()

    return ApiResponse.success(c, { certificates: domains }, 'Certificates fetched successfully.')
  } catch (error: unknown) {
    return ApiResponse.error(c, (error as Error).message, 'LIST_ERROR', 500)
  }
})
