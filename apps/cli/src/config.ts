import { readFile, writeFile, mkdir } from 'fs/promises'
import { join } from 'path'

const CONFIG_DIR = '/etc/ssl-pilot'
const CONFIG_PATH = join(CONFIG_DIR, 'config.json')

export interface ServiceConfig {
  apiUrl?: string
  renewalThresholdDays: number
  checkIntervalHours: number
}

const DEFAULTS: ServiceConfig = {
  renewalThresholdDays: 30,
  checkIntervalHours: 12,
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
  await mkdir(CONFIG_DIR, { recursive: true })
  await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n', {
    encoding: 'utf8',
    mode: 0o600,
  })
}
