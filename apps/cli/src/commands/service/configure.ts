import { Command } from 'commander'
import input from '@inquirer/input'
import { spawnSync } from 'child_process'
import { readConfig, writeConfig } from '../../config.js'

export const configureCommand = new Command('configure')
  .description('Update service config (watch domains, check interval) and restart')
  .action(async () => {
    try {
      if (process.getuid?.() !== 0) {
        console.error('Error: sp service configure must run as root.')
        console.error('\n  sudo sp service configure\n')
        process.exit(1)
      }

      const existing = await readConfig()

      console.log('\nSSL Pilot — Update Service Config\n')
      console.log('  (API key is stored in the systemd unit, not changed here)\n')

      const intervalStr = await input({
        message: 'Check interval (hours):',
        default: String(existing.checkIntervalHours),
        validate: (v) =>
          Number.isInteger(Number(v)) && Number(v) > 0 ? true : 'Must be a positive integer',
      })

      const thresholdStr = await input({
        message: 'Download cert when expiry within (days):',
        default: String(existing.renewalThresholdDays),
        validate: (v) =>
          Number.isInteger(Number(v)) && Number(v) > 0 ? true : 'Must be a positive integer',
      })

      const retriesStr = await input({
        message: 'Max download retries per cert:',
        default: String(existing.maxDownloadRetries),
        validate: (v) =>
          Number.isInteger(Number(v)) && Number(v) >= 0 ? true : 'Must be a non-negative integer',
      })

      const domainsRaw = await input({
        message: 'Watch specific domains (comma-separated, blank = all active):',
        default: existing.watchDomains.join(', '),
      })

      const watchDomains = domainsRaw
        .split(',')
        .map(d => d.trim())
        .filter(Boolean)

      await writeConfig({
        ...existing,
        checkIntervalHours:   Number(intervalStr),
        renewalThresholdDays: Number(thresholdStr),
        maxDownloadRetries:   Number(retriesStr),
        watchDomains,
      })

      console.log('\n✓ Config updated at /etc/ssl-pilot/config.json')

      const result = spawnSync('systemctl', ['restart', 'ssl-pilot'], {
        stdio: ['inherit', 'inherit', 'pipe'],
        encoding: 'utf8',
      })

      if (result.status !== 0) {
        if (result.stderr?.trim()) process.stderr.write(result.stderr + '\n')
        process.stderr.write('\nWarning: config saved but service restart failed.\n')
        process.stderr.write('  Run: sudo sp service start\n\n')
        process.exit(1)
      }

      console.log('✓ Service restarted with new config.\n')
    } catch (err) {
      if ((err as NodeJS.ErrnoException).name === 'ExitPromptError') process.exit(0)
      console.error(`\nError: ${(err as Error).message}`)
      process.exit(1)
    }
  })
