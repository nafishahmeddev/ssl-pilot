import { serve } from '@hono/node-server'
import type { ServerType } from '@hono/node-server'
import app from '@src/app'
import { env } from '@src/shared/config/env'
import { logger } from '@src/shared/utils/logger'
import { connectDB } from '@src/shared/database/mongoose'
import { startRenewalJob, stopRenewalJob } from '@src/jobs/renewal.job'

let server: ServerType

async function startServer() {
  await connectDB()

  startRenewalJob()

  server = serve({
    fetch: app.fetch,
    port: env.PORT,
  }, (info) => {
    logger.info(`Server is running on http://localhost:${info.port}`)
  })
}

startServer().catch((err) => {
  logger.fatal(err, 'Fatal: server failed to start')
  process.exit(1)
})

const shutdown = () => {
  logger.info('Shutting down gracefully...')
  stopRenewalJob()
  ;(server as any).closeAllConnections?.()
  server.close((err) => {
    if (err) {
      logger.error(err, 'Error during shutdown')
      process.exit(1)
    }
    logger.info('Server closed.')
    process.exit(0)
  })
}

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)

// Catch-all for unhandled async errors — last resort before Node crashes the process
process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'Unhandled promise rejection')
})
process.on('uncaughtException', (err) => {
  logger.fatal(err, 'Uncaught exception — shutting down')
  process.exit(1)
})
