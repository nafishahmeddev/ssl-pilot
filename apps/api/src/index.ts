import { serve } from '@hono/node-server'
import type { ServerType } from '@hono/node-server'
import app from '@src/app'
import { env } from '@src/shared/config/env'
import { logger } from '@src/shared/utils/logger'
import { connectDB } from '@src/shared/database/mongoose'

let server: ServerType

async function startServer() {
  // Connect to Database
  await connectDB()

  server = serve({
    fetch: app.fetch,
    port: env.PORT
  }, (info) => {
    logger.info(`Server is running on http://localhost:${info.port}`)
  })
}

startServer()

/**
 * Handles graceful shutdown by closing the server.
 */
const shutdown = () => {
  logger.info('Shutting down gracefully...');
  (server as any).closeAllConnections?.()
  server.close((err) => {
    if (err) {
      logger.error(err, 'Error during shutdown')
      process.exit(1)
    }
    logger.info('Server closed.')
    process.exit(0)
  })
}

// Handle standard termination signals
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
