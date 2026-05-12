import { createMiddleware } from 'hono/factory'
import { logger } from '@src/shared/utils/logger'

/**
 * Middleware to log incoming requests and outgoing responses.
 * Uses the shared Pino logger for structured logging.
 */
export const requestLogger = createMiddleware(async (c, next) => {
  const { method, url } = c.req
  const startTime = Date.now()
  
  // Log request
  logger.info({ method, url }, `Incoming Request: ${method} ${url}`)
  
  await next()
  
  const duration = Date.now() - startTime
  const status = c.res.status
  
  // Log response with status and duration
  const logData = {
    method,
    url,
    status,
    duration: `${duration}ms`
  }
  
  if (status >= 400) {
    logger.warn(logData, `Request Failed: ${method} ${url} - Status ${status}`)
  } else {
    logger.info(logData, `Request Succeeded: ${method} ${url} - Status ${status}`)
  }
})
