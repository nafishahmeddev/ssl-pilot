import { createApiClient } from '../../api.js'
import { saveCert } from '../../files.js'
import { readConfig } from '../../config.js'
import { readState, updateCertState } from '../../state.js'
import { runHooks } from '../../hooks.js'

export interface RenewalResult {
  checked: number
  downloaded: number
  errors: number
}

export async function resolveApiKey(): Promise<string | null> {
  if (process.env['SSL_PILOT_API_KEY']) return process.env['SSL_PILOT_API_KEY']

  try {
    const { execSync } = await import('child_process')
    const out   = execSync('systemctl show ssl-pilot -p Environment --value', { encoding: 'utf8' })
    const match = out.match(/SSL_PILOT_API_KEY=(\S+)/)
    return match?.[1] ?? null
  } catch {
    return null
  }
}

export async function runRenewalCycle(
  apiKey: string,
  log: (msg: string) => void,
): Promise<RenewalResult> {
  const config    = await readConfig()
  const client    = createApiClient({ apiKey, apiUrl: config.apiUrl })
  const allCerts  = await client.listCerts()

  const certs = config.watchDomains.length > 0
    ? allCerts.filter(c => config.watchDomains.includes(c.certName))
    : allCerts.filter(c => c.status === 'active')

  const state       = await readState()
  const thresholdMs = config.renewalThresholdDays * 24 * 60 * 60 * 1000
  const now         = Date.now()

  let downloaded = 0
  let errors     = 0

  for (const cert of certs) {
    if (cert.status !== 'active') {
      log(`Skip ${cert.certName} — ${cert.status}`)
      continue
    }

    const local           = state[cert.certName]
    const certExpiry      = cert.expiryDate ? new Date(cert.expiryDate).getTime() : 0
    const neverDownloaded = !local
    const expiryChanged   = !neverDownloaded && local.expiryDate !== cert.expiryDate
    const expiringInTime  = certExpiry > 0 && certExpiry - now <= thresholdMs

    if (!neverDownloaded && !expiryChanged && !expiringInTime) {
      const daysLeft = certExpiry ? Math.ceil((certExpiry - now) / 86_400_000) : 0
      log(`OK ${cert.certName} — ${daysLeft}d until expiry`)
      continue
    }

    const reason = neverDownloaded ? 'first download' : expiryChanged ? 'cert renewed' : 'expiring soon'
    log(`Downloading ${cert.certName} (${reason})…`)

    try {
      const files              = await client.downloadCert(cert._id)
      const { certPath, keyPath } = await saveCert(files.certName, files.certPem, files.keyPem)

      log(`  cert : ${certPath}`)
      log(`  key  : ${keyPath}`)

      await updateCertState(cert.certName, files.expiryDate ?? cert.expiryDate ?? '')

      await runHooks(cert.certName, {
        SSL_PILOT_DOMAIN:    cert.certName.replace(/^\*\./, ''),
        SSL_PILOT_CERT_PATH: certPath,
        SSL_PILOT_KEY_PATH:  keyPath,
      }, log)

      downloaded++
    } catch (err) {
      log(`  error: ${(err as Error).message}`)
      errors++
    }
  }

  return { checked: certs.length, downloaded, errors }
}
