import { Hono } from 'hono'
import type { Env } from '@src/app'
import { ApiResponse } from '@src/shared/utils/response'

const router = new Hono<Env>()

/**
 * @route GET /api/ping
 * @desc Ping pong endpoint
 * @access Public
 */
router.get('/', (c) => {
  return ApiResponse.success(c, { reply: 'pong' }, 'Ping successful')
})

export default router
