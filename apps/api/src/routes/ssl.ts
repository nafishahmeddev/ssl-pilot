import { Hono } from 'hono'
import { authMiddleware } from '@src/shared/middlewares/auth.middleware'
import { initiateSslHandler, verifySslHandler, listCertificatesHandler } from '@src/controllers/ssl.controller'
import type { Env } from '@src/app'

const router = new Hono<Env>()

router.use('*', authMiddleware)

router.get('/certificates', ...listCertificatesHandler)
router.post('/initiate', ...initiateSslHandler)
router.post('/verify', ...verifySslHandler)

export default router
