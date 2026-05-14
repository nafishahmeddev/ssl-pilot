import { Command } from 'commander'
import { execSync } from 'child_process'
import { unlink } from 'fs/promises'
import { createApiClient } from '../../api.js'
import { saveCert } from '../../files.js'
import { readConfig } from '../../config.js'
import { readState, updateCertState } from '../../state.js'
import { runHooks } from '../../hooks.js'

const UNIT      = 'ssl-pilot'
const UNIT_PATH = '/etc/systemd/system/ssl-pilot.service'

function systemctl(args: string): void {
  try {
    execSync(`systemctl ${args}`, { stdio: 'inherit' })
  } catch {
    process.exit(1)
  }
}

function requireRoot(): void {
  if (process.getuid?.() !== 0) {
    console.error('\n  Error: this command requires root (sudo).\n')
    process.exit(1)
  }
}

export const startCommand = new Command('start')
  .description('Start the SSL Pilot service')
  .action(() => { requireRoot(); systemctl(`start ${UNIT}`) })

export const stopCommand = new Command('stop')
  .description('Stop the SSL Pilot service')
  .action(() => { requireRoot(); systemctl(`stop ${UNIT}`) })

export const statusCommand = new Command('status')
  .description('Show SSL Pilot service status')
  .action(() => systemctl(`status ${UNIT}`))

export const checkCommand = new Command('check')
  .description('Run one renewal check cycle immediately (useful for testing)')
  .action(async () => {
    requireRoot()

    const apiKey = process.env['SSL_PILOT_API_KEY']
    if (!apiKey) {
      // Try reading from systemd unit
      try {
        const unit = execSync(`systemctl show ${UNIT} -p Environment`, { encoding: 'utf8' })
        const match = unit.match(/SSL_PILOT_API_KEY=([^\s]+)/)
        if (match) process.env['SSL_PILOT_API_KEY'] = match[1]
      } catch { /* ignore */ }
    }

    const key = process.env['SSL_PILOT_API_KEY']
    if (!key) {
      console.error('\n  Error: SSL_PILOT_API_KEY not available.')
      console.error('  Set it in env or run: sudo sp service install\n')
      process.exit(1)
    }

    const config = await readConfig()
    const client = createApiClient({ apiKey: key, apiUrl: config.apiUrl })
    const state  = await readState()

    let allCerts
    try {
      allCerts = await client.listCerts()
    } catch (err) {
      console.error(`\n  Error: ${(err as Error).message}\n`)
      process.exit(1)
    }

    const certs = config.watchDomains.length > 0
      ? allCerts.filter(c => config.watchDomains.includes(c.certName))
      : allCerts.filter(c => c.status === 'active')

    if (certs.length === 0) {
      console.log('\n  No watched certificates found.\n')
      return
    }

    const thresholdMs = config.renewalThresholdDays * 24 * 60 * 60 * 1000
    const now         = Date.now()

    console.log(`\n  Checking ${certs.length} certificate(s)…\n`)

    for (const cert of certs) {
      if (cert.status !== 'active') {
        console.log(`  ○ ${cert.certName}  —  skipped (${cert.status})`)
        continue
      }

      const local        = state[cert.certName]
      const certExpiry   = cert.expiryDate ? new Date(cert.expiryDate).getTime() : 0
      const expiryChanged   = local ? local.expiryDate !== cert.expiryDate : false
      const expiringInTime  = certExpiry > 0 && (certExpiry - now) <= thresholdMs
      const neverDownloaded = !local

      if (!neverDownloaded && !expiryChanged && !expiringInTime) {
        const daysLeft = certExpiry ? Math.ceil((certExpiry - now) / 86400000) : 0
        console.log(`  ✓ ${cert.certName}  —  OK, ${daysLeft} days until expiry`)
        continue
      }

      const reason = neverDownloaded ? 'first download' : expiryChanged ? 'cert renewed' : 'expiring soon'
      console.log(`  ↓ ${cert.certName}  —  downloading (${reason})…`)

      try {
        const files = await client.downloadCert(cert._id)
        const { certPath, keyPath } = await saveCert(files.certName, files.certPem, files.keyPem)

        console.log(`      Cert : ${certPath}`)
        console.log(`      Key  : ${keyPath}`)

        await updateCertState(cert.certName, files.expiryDate ?? cert.expiryDate ?? '')

        await runHooks(cert.certName, {
          SSL_PILOT_DOMAIN:    cert.certName.replace(/^\*\./, ''),
          SSL_PILOT_CERT_PATH: certPath,
          SSL_PILOT_KEY_PATH:  keyPath,
        }, (msg) => console.log(`      ${msg.trim()}`))

        console.log(`      ✓ Done`)
      } catch (err) {
        console.error(`      ✗ Error: ${(err as Error).message}`)
      }
    }

    console.log('')
  })

export const uninstallServiceCommand = new Command('uninstall')
  .description('Stop, disable, and remove the SSL Pilot service unit')
  .action(async () => {
    requireRoot()

    console.log('\n  Removing SSL Pilot service…\n')

    try { execSync(`systemctl stop ${UNIT}`,    { stdio: 'pipe' }) } catch { /* not running */ }
    try { execSync(`systemctl disable ${UNIT}`, { stdio: 'pipe' }) } catch { /* not enabled */ }

    try {
      await unlink(UNIT_PATH)
      console.log(`  ✓ Removed ${UNIT_PATH}`)
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
    }

    try { execSync('systemctl daemon-reload', { stdio: 'pipe' }) } catch { /* ignore */ }

    console.log('\n  ✓ Service uninstalled.')
    console.log('    Config and certs at /etc/ssl-pilot/ were NOT removed.')
    console.log('    Run "sudo sp service install" to reinstall.\n')
  })
