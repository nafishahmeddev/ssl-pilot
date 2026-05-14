import pino, { type TransportTargetOptions } from 'pino'
import { env } from '@src/shared/config/env'

const isDev = env.NODE_ENV === 'development'

const tagets: TransportTargetOptions[] = [{
  target: 'pino-pretty',
  options: { colorize: true, translateTime: 'SYS:standard' },
}]

if (env.NODE_ENV == "production") {
  tagets.push({
    target: '@axiomhq/pino',
    options: { dataset: env.AXIOM_DATASET as string, token: env.AXIOM_TOKEN as string },
  })
}

const transport = pino.transport({
  targets: tagets,
  level: isDev ? 'debug' : 'info',
})

export const logger = pino(transport)

export default logger
