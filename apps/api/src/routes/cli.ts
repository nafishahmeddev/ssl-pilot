import { Hono } from 'hono'
import { authMiddleware } from '@src/shared/middlewares/auth.middleware'
import { apiKeyMiddleware } from '@src/shared/middlewares/apikey.middleware'
import {
  cliListCertsHandler,
  cliDownloadCertHandler,
  createApiKeyHandler,
  listApiKeysHandler,
  deleteApiKeyHandler,
} from '@src/controllers/cli.controller'
import type { Env } from '@src/app'

const router = new Hono<Env>()

// API key management — JWT-protected (panel users manage their own keys)
router.get('/api-keys',        authMiddleware, ...listApiKeysHandler)
router.post('/api-keys',       authMiddleware, ...createApiKeyHandler)
router.delete('/api-keys/:id', authMiddleware, ...deleteApiKeyHandler)

// CLI data routes — API key-protected
router.get('/certs',              apiKeyMiddleware, ...cliListCertsHandler)
router.get('/certs/:id/download', apiKeyMiddleware, ...cliDownloadCertHandler)

export default router
