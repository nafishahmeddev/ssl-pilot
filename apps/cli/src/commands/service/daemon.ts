import { Command } from 'commander'
import { createApiClient } from '../../api.js'
import { saveCert } from '../../files.js'
import { readConfig } from '../../config.js'
import { readState, updateCertState } from '../../state.js'
import { runHooks } from '../../hooks.js'

function log(msg: string): void {
  console.log(`[${new Date().toISOString()}] ${msg}`)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function checkAndRenew(): Promise<void> {
  const apiKey = process.env['SSL_PILOT_API_KEY']
  if (!apiKey) {
    log('SSL_PILOT_API_KEY not set — skipping check.')
    return
  }

  let config
  try {
    config = await readConfig()
  } catch (err) {
    log(`Failed to read config: ${(err as Error).message}`)
    return
  }

  const client = createApiClient({ apiKey, apiUrl: config.apiUrl })

  let allCerts
  try {
    allCerts = await client.listCerts()
  } catch (err) {
    log(`Failed to list certs: ${(err as Error).message}`)
    return
  }

  // Filter to watched domains; if watchDomains is empty, watch all active certs
  const certs = config.watchDomains.length > 0
    ? allCerts.filter(c => config.watchDomains.includes(c.certName))
    : allCerts.filter(c => c.status === 'active')

  if (certs.length === 0) {
    log('No watched certs found.')
    return
  }

  const state          = await readState()
  const thresholdMs    = config.renewalThresholdDays * 24 * 60 * 60 * 1000
  const now            = Date.now()

  for (const cert of certs) {
    if (cert.status !== 'active') {
      log(`Skip ${cert.certName} — status: ${cert.status}`)
      continue
    }

    const local = state[cert.certName]

    // Needs download if: never downloaded, cert renewed server-side, or expiry within threshold
    const certExpiry      = cert.expiryDate ? new Date(cert.expiryDate).getTime() : 0
    const expiryChanged   = local ? local.expiryDate !== cert.expiryDate : false
    const expiringInTime  = certExpiry > 0 && (certExpiry - now) <= thresholdMs
    const neverDownloaded = !local

    if (!neverDownloaded && !expiryChanged && !expiringInTime) {
      log(`OK ${cert.certName} — expires ${cert.expiryDate ?? 'unknown'} (local match, not due)`)
      continue
    }

    const reason = neverDownloaded ? 'first download' : expiryChanged ? 'cert renewed' : 'expiring soon'
    log(`Downloading ${cert.certName} (${reason})…`)

    try {
      const files = await client.downloadCert(cert._id)
      const { certPath, keyPath } = await saveCert(files.certName, files.certPem, files.keyPem)

      log(`  Cert : ${certPath}`)
      log(`  Key  : ${keyPath}`)

      await updateCertState(cert.certName, files.expiryDate ?? cert.expiryDate ?? '')

      await runHooks(cert.certName, {
        SSL_PILOT_DOMAIN:    cert.certName.replace(/^\*\./, ''),
        SSL_PILOT_CERT_PATH: certPath,
        SSL_PILOT_KEY_PATH:  keyPath,
      }, log)
    } catch (err) {
      log(`  Error: ${(err as Error).message}`)
    }
  }
}

export const daemonCommand = new Command('run')
  .description('Run the monitoring daemon (called by systemd — not for direct use)')
  .action(async () => {
    log('SSL Pilot daemon starting.')

    process.on('SIGTERM', () => { log('SIGTERM — shutting down.'); process.exit(0) })
    process.on('SIGINT',  () => { log('SIGINT — shutting down.');  process.exit(0) })

    while (true) {
      await checkAndRenew()
      const config = await readConfig()
      await sleep(config.checkIntervalHours * 60 * 60 * 1000)
    }
  })
