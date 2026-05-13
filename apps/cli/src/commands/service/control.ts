import { Command } from 'commander'
import { execSync } from 'child_process'
import { unlink } from 'fs/promises'

const UNIT = 'ssl-pilot'
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
    console.error(`Error: this command must run as root (use sudo).`)
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

export const uninstallServiceCommand = new Command('uninstall')
  .description('Stop, disable, and remove the SSL Pilot service unit')
  .action(async () => {
    requireRoot()

    try { execSync(`systemctl stop ${UNIT}`,    { stdio: 'pipe' }) } catch { /* not running */ }
    try { execSync(`systemctl disable ${UNIT}`, { stdio: 'pipe' }) } catch { /* not enabled */ }

    try {
      await unlink(UNIT_PATH)
      console.log(`✓ Removed ${UNIT_PATH}`)
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
    }

    try { execSync('systemctl daemon-reload', { stdio: 'pipe' }) } catch { /* ignore */ }

    console.log('\n✓ Service uninstalled.\n')
    console.log('  Note: /etc/ssl-pilot/ (config + certs) was NOT removed.')
    console.log('  Run "sp service install" to reinstall.\n')
  })
