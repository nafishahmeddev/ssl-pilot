import { Command } from 'commander'
import { readConfig } from '../../config.js'
import { resolveApiKey, runRenewalCycle } from './renew.js'

function log(msg: string): void {
  process.stdout.write(`[${new Date().toISOString()}] ${msg}\n`)
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function tick(): Promise<void> {
  const apiKey = await resolveApiKey()

  if (!apiKey) {
    log('SSL_PILOT_API_KEY not available — skipping cycle.')
    return
  }

  try {
    const result = await runRenewalCycle(apiKey, log)
    log(`Cycle complete — checked: ${result.checked}, downloaded: ${result.downloaded}, errors: ${result.errors}`)
  } catch (err) {
    log(`Cycle failed: ${(err as Error).message}`)
  }
}

export const daemonCommand = new Command('run')
  .description('Run the monitoring daemon (managed by systemd)')
  .action(async () => {
    log('SSL Pilot daemon starting.')

    process.on('SIGTERM', () => { log('SIGTERM — shutting down.'); process.exit(0) })
    process.on('SIGINT',  () => { log('SIGINT — shutting down.');  process.exit(0) })

    while (true) {
      await tick()
      const config = await readConfig()
      await sleep(config.checkIntervalHours * 60 * 60 * 1000)
    }
  })
