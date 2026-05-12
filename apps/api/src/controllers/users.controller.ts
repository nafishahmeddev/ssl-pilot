import { createFactory } from 'hono/factory'
import { zValidator } from '@hono/zod-validator'
import { createUserSchema } from '@src/schemas/users'
import { ApiResponse } from '@src/shared/utils/response'
import { logger } from '@src/shared/utils/logger'
import type { Env } from '@src/app'

const factory = createFactory<Env>()

/**
 * User Handlers created using Hono Factory.
 */

export const createUserHandler = factory.createHandlers(
  zValidator('json', createUserSchema),
  async (c) => {
    const data = c.req.valid('json')
    const requestId = c.get('requestId')
    
    logger.info({ requestId, userEmail: data.email }, 'Mock user creation successful')
    
    return ApiResponse.success(c, data, 'User created (mock)')
  }
)
