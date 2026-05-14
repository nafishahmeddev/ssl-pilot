import { Command } from 'commander'
import { getConfiguredClient } from '../client.js'

export const listCommand = new Command('list')
  .description('List all certificates in your organisation')
  .action(async () => {
    try {
      const client = await getConfiguredClient()
      const certs  = await client.listCerts()

      if (certs.length === 0) {
        process.stdout.write('\nNo certificates found in your account.\n\n')
        return
      }

      const active   = certs.filter(c => c.status === 'active')
      const inactive = certs.filter(c => c.status !== 'active')
      const maxLen   = Math.max(...certs.map(c => c.certName.length), 10)
      const pad      = (s: string, n: number) => s.padEnd(n)

      const typeTag = (type: string) =>
        type === 'wildcard' ? '[wildcard]' : type === 'apex' ? '[apex]    ' : '[single]  '

      process.stdout.write(`\nFound ${certs.length} certificate(s)\n`)

      if (active.length > 0) {
        process.stdout.write(`\nACTIVE (${active.length})\n`)
        for (const c of active) {
          const expiry = c.expiryDate
            ? `expires ${new Date(c.expiryDate).toLocaleDateString()}`
            : 'no expiry info'
          process.stdout.write(`  ${pad(c.certName, maxLen)}  ${typeTag(c.certType)}  ${expiry}\n`)
        }
      }

      if (inactive.length > 0) {
        process.stdout.write(`\nOTHER (${inactive.length})\n`)
        for (const c of inactive) {
          process.stdout.write(`  ${pad(c.certName, maxLen)}  ${typeTag(c.certType)}  ${c.status}\n`)
        }
      }

      process.stdout.write('\n')
    } catch (err) {
      process.stderr.write(`\nError: ${(err as Error).message}\n\n`)
      process.exit(1)
    }
  })
