import { Command } from 'commander'
import { spawnSync } from 'child_process'
import { unlink } from 'fs/promises'
import { resolveApiKey, runRenewalCycle } from './renew.js'

const UNIT      = 'ssl-pilot'
const UNIT_PATH = '/etc/systemd/system/ssl-pilot.service'

/**
 * Runs systemctl with stdout inherited (visible) and stderr captured.
 * Stderr is only printed if the command fails, so noisy shim warnings
 * from Python-based systemctl stubs don't pollute normal output.
 */
function systemctl(args: string[], exitOnFail = true): boolean {
  const result = spawnSync('systemctl', args, {
    stdio: ['inherit', 'inherit', 'pipe'],
    encoding: 'utf8',
  })

  if (result.status !== 0) {
    if (result.stderr?.trim()) process.stderr.write(result.stderr + '\n')
    if (exitOnFail) process.exit(1)
    return false
  }

  return true
}

function requireRoot(): void {
  if (process.getuid?.() !== 0) {
    process.stderr.write('\nError: this command requires root. Use sudo.\n\n')
    process.exit(1)
  }
}

export const startCommand = new Command('start')
  .description('Start the SSL Pilot service')
  .action(() => { requireRoot(); systemctl(['start', UNIT]) })

export const stopCommand = new Command('stop')
  .description('Stop the SSL Pilot service')
  .action(() => { requireRoot(); systemctl(['stop', UNIT]) })

export const restartCommand = new Command('restart')
  .description('Restart the service — picks up config.json changes immediately')
  .action(() => { requireRoot(); systemctl(['restart', UNIT]) })

export const statusCommand = new Command('status')
  .description('Show SSL Pilot service status')
  .action(() => { systemctl(['status', UNIT]) })

export const checkCommand = new Command('check')
  .description('Run one renewal check cycle immediately (for testing)')
  .action(async () => {
    requireRoot()

    const apiKey = await resolveApiKey()

    if (!apiKey) {
      process.stderr.write('\nError: SSL_PILOT_API_KEY not found in environment or service unit.\n')
      process.stderr.write('  Set the env var or run: sudo sp service install\n\n')
      process.exit(1)
    }

    const log = (msg: string) => process.stdout.write(`  ${msg}\n`)

    process.stdout.write('\nRunning renewal check…\n\n')

    try {
      const result = await runRenewalCycle(apiKey, log)
      process.stdout.write(`\n  Done — checked: ${result.checked}, downloaded: ${result.downloaded}, errors: ${result.errors}\n\n`)
      if (result.errors > 0) process.exit(1)
    } catch (err) {
      process.stderr.write(`\nError: ${(err as Error).message}\n\n`)
      process.exit(1)
    }
  })

export const uninstallServiceCommand = new Command('uninstall')
  .description('Stop, disable, and remove the SSL Pilot service unit')
  .action(async () => {
    requireRoot()

    process.stdout.write('\nRemoving SSL Pilot service…\n\n')

    systemctl(['stop',    UNIT], false)
    systemctl(['disable', UNIT], false)

    try {
      await unlink(UNIT_PATH)
      process.stdout.write(`  ✓ Removed ${UNIT_PATH}\n`)
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
    }

    systemctl(['daemon-reload'], false)

    process.stdout.write('\n  ✓ Service uninstalled.\n')
    process.stdout.write('    /etc/ssl-pilot/ (config, state, certs, hooks) was NOT removed.\n')
    process.stdout.write('    Run "sudo sp service install" to reinstall.\n\n')
  })
