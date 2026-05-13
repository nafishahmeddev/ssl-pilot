import { Command } from 'commander'
import { createApiClient } from '../../api.js'
import { saveCert } from '../../files.js'
import { readConfig } from '../../config.js'

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

  let certs
  try {
    certs = await client.listCerts()
  } catch (err) {
    log(`Failed to list certs: ${(err as Error).message}`)
    return
  }

  const thresholdMs = config.renewalThresholdDays * 24 * 60 * 60 * 1000
  const now = Date.now()

  const toRenew = certs.filter((c) => {
    if (c.status !== 'active') return false
    if (!c.expiryDate) return false
    return new Date(c.expiryDate).getTime() - now <= thresholdMs
  })

  if (toRenew.length === 0) {
    log(`All ${certs.length} cert(s) OK. Next check in ${config.checkIntervalHours}h.`)
    return
  }

  log(`${toRenew.length} cert(s) due for renewal.`)

  for (const cert of toRenew) {
    log(`Downloading ${cert.certName} (expires ${cert.expiryDate ?? 'unknown'})…`)
    try {
      const files = await client.downloadCert(cert._id)
      const { certPath, keyPath } = await saveCert(files.certName, files.certPem, files.keyPem)
      log(`  Cert : ${certPath}`)
      log(`  Key  : ${keyPath}`)
    } catch (err) {
      log(`  Error: ${(err as Error).message}`)
    }
  }
}

export const daemonCommand = new Command('run')
  .description('Run the monitoring daemon (called by systemd — not for direct use)')
  .action(async () => {
    log('SSL Pilot daemon starting.')

    process.on('SIGTERM', () => {
      log('SIGTERM received — shutting down.')
      process.exit(0)
    })

    process.on('SIGINT', () => {
      log('SIGINT received — shutting down.')
      process.exit(0)
    })

    while (true) {
      await checkAndRenew()
      const config = await readConfig()
      await sleep(config.checkIntervalHours * 60 * 60 * 1000)
    }
  })
