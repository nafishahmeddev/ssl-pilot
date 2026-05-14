import { readFile, writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { SSL_PILOT_DIR } from './config.js'

const STATE_PATH = join(SSL_PILOT_DIR, 'state.json')

export interface CertState {
  expiryDate: string
  downloadedAt: string
}

export type StateFile = Record<string, CertState>

export async function readState(): Promise<StateFile> {
  try {
    const raw = await readFile(STATE_PATH, 'utf8')
    return JSON.parse(raw) as StateFile
  } catch (err) {
    const e = err as NodeJS.ErrnoException
    if (e.code === 'ENOENT') return {}
    throw err
  }
}

export async function updateCertState(certName: string, expiryDate: string): Promise<void> {
  const state = await readState()
  state[certName] = { expiryDate, downloadedAt: new Date().toISOString() }
  await mkdir(SSL_PILOT_DIR, { recursive: true })
  await writeFile(STATE_PATH, JSON.stringify(state, null, 2) + '\n', {
    encoding: 'utf8',
    mode: 0o600,
  })
}
