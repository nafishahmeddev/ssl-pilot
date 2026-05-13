import { Hono } from 'hono'
import { registerHandler, loginHandler, refreshHandler, logoutHandler, meHandler, changePasswordHandler } from '@src/controllers/auth.controller'
import { authMiddleware } from '@src/shared/middlewares/auth.middleware'
import type { Env } from '@src/app'

const router = new Hono<Env>()

/**
 * @route POST /api/auth/register
 */
router.post('/register', ...registerHandler)

/**
 * @route POST /api/auth/login
 */
router.post('/login', ...loginHandler)

/**
 * @route POST /api/auth/refresh
 */
router.post('/refresh', ...refreshHandler)

/**
 * @route POST /api/auth/logout
 */
router.post('/logout', ...logoutHandler)

/**
 * @route GET /api/auth/me
 */
router.get('/me', authMiddleware, ...meHandler)

/**
 * @route POST /api/auth/change-password
 */
router.post('/change-password', authMiddleware, ...changePasswordHandler)

export default router
