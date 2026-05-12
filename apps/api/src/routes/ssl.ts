import { Hono } from 'hono'
import { authMiddleware } from '@src/shared/middlewares/auth.middleware'
import {
  initiateSslHandler,
  verifySslHandler,
  recheckHandler,
  listCertificatesHandler,
  getDomainHandler,
  deleteDomainHandler,
} from '@src/controllers/ssl.controller'
import type { Env } from '@src/app'

const router = new Hono<Env>()

router.use('*', authMiddleware)

router.get('/certificates', ...listCertificatesHandler)
router.get('/domain/:id', ...getDomainHandler)
router.delete('/domain/:id', ...deleteDomainHandler)
router.post('/initiate', ...initiateSslHandler)
router.post('/verify', ...verifySslHandler)
router.post('/recheck', ...recheckHandler)

export default router
