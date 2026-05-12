import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { secureHeaders } from 'hono/secure-headers'
import { randomUUID } from 'crypto'
import routes from '@src/routes'
import { logger } from '@src/shared/utils/logger'
import { ApiResponse } from '@src/shared/utils/response'
import { requestLogger } from '@src/shared/middlewares/logger.middleware'
import { env } from '@src/shared/config/env'

/**
 * Environment variables and context state for the Hono app.
 */
export type Env = {
  Variables: {
    requestId: string
  }
}

const app = new Hono<Env>()

// CORS — must be first so preflight OPTIONS requests get headers before auth checks
app.use('*', cors({
  origin: (origin) => (origin === env.FRONTEND_URL ? origin : null),
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}))

// Use custom request/response logger
app.use('*', requestLogger)

// Apply secure headers globally for all responses
app.use('*', secureHeaders())

/**
 * Middleware to generate a unique request ID for each request.
 * This ID is shared via the context.
 */
app.use('*', async (c, next) => {
  const requestId = randomUUID()
  c.set('requestId', requestId)
  await next()
})

// Mount API routes from modules
app.route('/api', routes)

/**
 * Health check endpoint.
 */
app.get('/health', (c) => {
  const requestId = c.get('requestId')
  logger.debug({ requestId }, 'Health check endpoint hit')
  return ApiResponse.success(c, { status: 'ok' }, 'Server is healthy')
})

/**
 * Global Error Handler.
 * Enforces the same response format for all errors.
 */
app.onError((err, c) => {
  logger.error(err, 'Unhandled error occurred')
  
  // Best practice: Don't expose raw error messages to the client in production
  return ApiResponse.error(c, 'Internal Server Error', 'INTERNAL_ERROR', 500)
})

export default app
