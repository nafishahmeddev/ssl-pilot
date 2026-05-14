import { readFile, writeFile, mkdir } from 'fs/promises'
import { join } from 'path'

export const SSL_PILOT_DIR = '/etc/ssl-pilot'
export const HOOKS_DIR     = join(SSL_PILOT_DIR, 'hooks')

const CONFIG_PATH = join(SSL_PILOT_DIR, 'config.json')

export interface ServiceConfig {
  apiUrl?: string
  renewalThresholdDays: number
  checkIntervalHours: number
  watchDomains: string[]  // empty = watch all active certs
}

const DEFAULTS: ServiceConfig = {
  renewalThresholdDays: 30,
  checkIntervalHours: 12,
  watchDomains: [],
}

export async function readConfig(): Promise<ServiceConfig> {
  try {
    const raw = await readFile(CONFIG_PATH, 'utf8')
    return { ...DEFAULTS, ...JSON.parse(raw) }
  } catch (err) {
    const e = err as NodeJS.ErrnoException
    if (e.code === 'ENOENT') return { ...DEFAULTS }
    throw err
  }
}

export async function writeConfig(config: ServiceConfig): Promise<void> {
  await mkdir(SSL_PILOT_DIR, { recursive: true })
  await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n', {
    encoding: 'utf8',
    mode: 0o600,
  })
}
