import { Command } from 'commander'
import input from '@inquirer/input'
import { writeFile } from 'fs/promises'
import { execSync } from 'child_process'
import { readConfig, writeConfig } from '../../config.js'

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

export const installCommand = new Command('install')
  .description('Install and configure the SSL Pilot background service')
  .action(async () => {
    try {
      if (process.getuid?.() !== 0) {
        console.error('Error: sp service install must run as root.')
        console.error('\n  sudo sp service install\n')
        process.exit(1)
      }

      console.log('\nSSL Pilot Service Setup\n')

      const existing = await readConfig()

      const apiKey = await input({
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

      const thresholdStr = await input({
        message: 'Renew certs expiring within (days):',
        default: String(existing.renewalThresholdDays),
        validate: (v) =>
          Number.isInteger(Number(v)) && Number(v) > 0
            ? true
            : 'Must be a positive integer',
      })

      const intervalStr = await input({
        message: 'Check interval (hours):',
        default: String(existing.checkIntervalHours),
        validate: (v) =>
          Number.isInteger(Number(v)) && Number(v) > 0
            ? true
            : 'Must be a positive integer',
      })

      const config = {
        apiUrl: apiUrl.trim() || undefined,
        renewalThresholdDays: Number(thresholdStr),
        checkIntervalHours: Number(intervalStr),
      }

      await writeConfig(config)
      console.log('\n✓ Config written to /etc/ssl-pilot/config.json')

      await writeFile(UNIT_PATH, buildUnitContent(apiKey), { encoding: 'utf8', mode: 0o600 })
      console.log(`✓ Systemd unit written to ${UNIT_PATH}`)

      execSync('systemctl daemon-reload', { stdio: 'inherit' })
      execSync('systemctl enable ssl-pilot', { stdio: 'inherit' })
      execSync('systemctl restart ssl-pilot', { stdio: 'inherit' })

      console.log('\n✓ Service enabled and started.\n')
      console.log('  Check status : sp service status')
      console.log('  Follow logs  : journalctl -u ssl-pilot -f\n')
    } catch (err) {
      if ((err as NodeJS.ErrnoException).name === 'ExitPromptError') {
        process.exit(0)
      }
      console.error(`\nError: ${(err as Error).message}`)
      process.exit(1)
    }
  })
