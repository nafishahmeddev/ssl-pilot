import pino from 'pino'
import { env } from '@src/shared/config/env'

const isDev = env.NODE_ENV === 'development'

// env schema enforces AXIOM_DATASET + AXIOM_TOKEN in production
const transport: pino.TransportSingleOptions = isDev
  ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:standard' } }
  : { target: '@axiomhq/pino', options: { dataset: env.AXIOM_DATASET as string, token: env.AXIOM_TOKEN as string } }

export const logger = pino({
  level: isDev ? 'debug' : 'info',
  transport,
})

export default logger
