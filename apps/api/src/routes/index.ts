import { Hono } from 'hono'
import users from './users'
import ping from './ping'
import ssl from './ssl'
import auth from './auth'
import cli from './cli'
import type { Env } from '@src/app'

const router = new Hono<Env>()

router.route('/users', users)
router.route('/ping', ping)
router.route('/ssl', ssl)
router.route('/auth', auth)
router.route('/cli', cli)

export default router
