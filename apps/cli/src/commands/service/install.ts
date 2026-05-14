import { Command } from 'commander'
import input from '@inquirer/input'
import { writeFile, mkdir } from 'fs/promises'
import { spawnSync } from 'child_process'
import { readConfig, writeConfig, HOOKS_DIR } from '../../config.js'
import { domainHookPath, GLOBAL_HOOK } from '../../hooks.js'

const UNIT_PATH = '/etc/systemd/system/ssl-pilot.service'

function buildUnitContent(apiKey: string): string {
  return `\
[Unit]
Description=SSL Pilot Certificate Monitor
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
Environment=SSL_PILOT_API_KEY=${apiKey}
ExecStart=/usr/local/bin/sp service run
Restart=on-failure
RestartSec=30
StandardOutput=journal
StandardError=journal
SyslogIdentifier=ssl-pilot

[Install]
WantedBy=multi-user.target
`
}

const HOOK_TEMPLATE = `#!/usr/bin/env bash
# Available env vars:
#   SSL_PILOT_CERT_NAME  — certificate name (e.g. *.example.com)
#   SSL_PILOT_DOMAIN     — domain without wildcard (e.g. example.com)
#   SSL_PILOT_CERT_PATH  — path to certificate.crt
#   SSL_PILOT_KEY_PATH   — path to private.key

# Example: reload nginx after cert update
# systemctl reload nginx
`

export const installCommand = new Command('install')
  .description('Install and configure the SSL Pilot background service')
  .action(async () => {
    try {
      if (process.getuid?.() !== 0) {
        console.error('Error: sp service install must run as root.')
        console.error('\n  sudo -E sp service install\n')
        process.exit(1)
      }

      console.log('\nSSL Pilot Service Setup\n')

      const existing = await readConfig()

      // API key — env takes precedence, otherwise prompt
      const apiKey = process.env['SSL_PILOT_API_KEY'] ?? await input({
        message: 'SSL Pilot API key (sslpilot_...):',
        validate: (v) =>
          v.startsWith('sslpilot_') && v.length > 10
            ? true
            : 'Key must start with sslpilot_',
      })

      const apiUrl = await input({
        message: 'API URL (leave blank for default https://ssl.idexa.app):',
        default: existing.apiUrl ?? '',
      })

      const intervalStr = await input({
        message: 'Check interval (hours):',
        default: String(existing.checkIntervalHours),
        validate: (v) =>
          Number.isInteger(Number(v)) && Number(v) > 0 ? true : 'Must be a positive integer',
      })

      const domainsRaw = await input({
        message: 'Watch specific domains (comma-separated, blank = all active):',
        default: existing.watchDomains.join(', '),
      })

      const watchDomains = domainsRaw
        .split(',')
        .map(d => d.trim())
        .filter(Boolean)

      const config = {
        apiUrl: apiUrl.trim() || undefined,
        renewalThresholdDays: existing.renewalThresholdDays,
        checkIntervalHours: Number(intervalStr),
        watchDomains,
        maxDownloadRetries: existing.maxDownloadRetries,
      }

      // Write config + create directories
      await writeConfig(config)
      await mkdir(HOOKS_DIR, { recursive: true })
      console.log('\n✓ Config written to /etc/ssl-pilot/config.json')

      // Create hook stubs only if they don't exist yet
      for (const domain of watchDomains) {
        const hookFile = domainHookPath(domain)
        try {
          await writeFile(hookFile, HOOK_TEMPLATE, { flag: 'wx', mode: 0o755 })
          console.log(`✓ Hook stub created: ${hookFile}`)
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err
        }
      }

      try {
        await writeFile(GLOBAL_HOOK, HOOK_TEMPLATE, { flag: 'wx', mode: 0o755 })
        console.log(`✓ Global hook stub created: ${GLOBAL_HOOK}`)
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err
      }

      // Write systemd unit
      await writeFile(UNIT_PATH, buildUnitContent(apiKey), { encoding: 'utf8', mode: 0o600 })
      console.log(`✓ Systemd unit written to ${UNIT_PATH}`)

      for (const args of [
        ['daemon-reload'],
        ['enable',  'ssl-pilot'],
        ['restart', 'ssl-pilot'],
      ]) {
        const r = spawnSync('systemctl', args, { stdio: ['inherit', 'inherit', 'pipe'], encoding: 'utf8' })
        if (r.status !== 0) {
          if (r.stderr?.trim()) process.stderr.write(r.stderr + '\n')
          process.exit(1)
        }
      }

      console.log('\n✓ Service enabled and started.\n')
      console.log('  Edit hooks in  : /etc/ssl-pilot/hooks/')
      console.log('  Check status   : sp service status')
      console.log('  Follow logs    : journalctl -u ssl-pilot -f\n')
    } catch (err) {
      if ((err as NodeJS.ErrnoException).name === 'ExitPromptError') process.exit(0)
      console.error(`\nError: ${(err as Error).message}`)
      process.exit(1)
    }
  })
