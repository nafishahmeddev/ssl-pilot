import { createFactory } from 'hono/factory'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { acmeService } from '@src/services/acme.service'
import { ApiResponse } from '@src/shared/utils/response'
import type { Env } from '@src/app'

const factory = createFactory<Env>()

// Schema for validating the domain request
const domainSchema = z.object({
  domain: z.string().min(3, 'Domain must be at least 3 characters').max(255)
})

/**
 * SSL Handlers created using Hono Factory.
 */

export const initiateSslHandler = factory.createHandlers(
  zValidator('json', domainSchema),
  async (c) => {
    const { domain } = c.req.valid('json')
    
    try {
      const challengeInfo = await acmeService.initiateOrder(domain)
      
      return ApiResponse.success(
        c, 
        challengeInfo, 
        'Order initiated. Please add the TXT record to your DNS.'
      )
    } catch (error: any) {
      return ApiResponse.error(c, error.message, 'INITIATE_ERROR', 500)
    }
  }
)

export const verifySslHandler = factory.createHandlers(
  zValidator('json', domainSchema),
  async (c) => {
    const { domain } = c.req.valid('json')
    
    try {
      const result = await acmeService.verifyAndIssue(domain)
      
      return ApiResponse.success(
        c, 
        result, 
        'Certificate issued successfully. Save the cert and key!'
      )
    } catch (error: any) {
      return ApiResponse.error(c, error.message, 'VERIFY_ERROR', 500)
    }
  }
)
