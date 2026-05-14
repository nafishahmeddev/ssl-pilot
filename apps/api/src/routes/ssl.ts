import { Hono } from 'hono'
import { authMiddleware } from '@src/shared/middlewares/auth.middleware'
import {
  wildcardCheckHandler,
  adoptWildcardHandler,
  initiateSslHandler,
  verifyChallengeHandler,
  generateCertHandler,
  listDomainsHandler,
  getCertHandler,
  deleteCertHandler,
  deleteDomainHandler,
} from '@src/controllers/ssl.controller'
import type { Env } from '@src/app'

const router = new Hono<Env>()

router.use('*', authMiddleware)

// Domains
router.get('/domains',       ...listDomainsHandler)
router.delete('/domains/:id',...deleteDomainHandler)

// Certificates
router.get('/certs/:id',     ...getCertHandler)
router.delete('/certs/:id',  ...deleteCertHandler)

// ACME flow
router.get('/wildcard-check', ...wildcardCheckHandler)
router.post('/adopt-wildcard',...adoptWildcardHandler)
router.post('/initiate',     ...initiateSslHandler)
router.post('/verify',       ...verifyChallengeHandler)
router.post('/generate',     ...generateCertHandler)

export default router
