import { readFile, writeFile, rename, mkdir } from 'fs/promises'
import { join } from 'path'
import { randomBytes } from 'crypto'
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
    if (err instanceof Error && (err as NodeJS.ErrnoException).code === 'ENOENT') return {}
    throw err
  }
}

export async function updateCertState(certName: string, expiryDate: string): Promise<void> {
  await mkdir(SSL_PILOT_DIR, { recursive: true })

  const state = await readState()
  state[certName] = { expiryDate, downloadedAt: new Date().toISOString() }

  const content = JSON.stringify(state, null, 2) + '\n'
  const tmp     = join(SSL_PILOT_DIR, `.state-${randomBytes(4).toString('hex')}.tmp`)

  await writeFile(tmp, content, { encoding: 'utf8', mode: 0o600 })
  await rename(tmp, STATE_PATH)
}
