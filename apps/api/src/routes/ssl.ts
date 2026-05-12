import { Hono } from 'hono'
import { authMiddleware } from '@src/shared/middlewares/auth.middleware'
import { initiateSslHandler, verifySslHandler } from '@src/controllers/ssl.controller'
import type { Env } from '@src/app'

const router = new Hono<Env>()

// Protect all SSL routes
router.use('*', authMiddleware)

/**
 * @route POST /api/ssl/initiate
 */
router.post('/initiate', ...initiateSslHandler)

/**
 * @route POST /api/ssl/verify
 */
router.post('/verify', ...verifySslHandler)

export default router
