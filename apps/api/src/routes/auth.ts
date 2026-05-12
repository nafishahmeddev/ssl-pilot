import { Hono } from 'hono'
import { registerHandler, loginHandler, refreshHandler, logoutHandler } from '@src/controllers/auth.controller'
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

export default router
