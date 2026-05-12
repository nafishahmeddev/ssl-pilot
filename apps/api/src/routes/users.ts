import { Hono } from 'hono'
import { createUserHandler } from '@src/controllers/users.controller'
import type { Env } from '@src/app'

const router = new Hono<Env>()

/**
 * @route POST /api/users
 * @desc Create a new user (mock)
 */
router.post('/', ...createUserHandler)

export default router
