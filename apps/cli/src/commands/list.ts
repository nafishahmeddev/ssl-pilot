import { Command } from 'commander'
import { getConfiguredClient } from '../client.js'

export const listCommand = new Command('list')
  .description('List all certificates in your organisation')
  .action(async () => {
    try {
      const client = await getConfiguredClient()
      const certs = await client.listCerts()

      if (certs.length === 0) {
        console.log('\n  No certificates found in your account.\n')
        return
      }

      const active   = certs.filter(c => c.status === 'active')
      const inactive = certs.filter(c => c.status !== 'active')

      const pad = (s: string, len: number) => s.padEnd(len)

      const maxNameLen = Math.max(...certs.map(c => c.certName.length), 12)

      const fmt = (c: (typeof certs)[number]) => {
        const tag    = c.certType === 'wildcard' ? '[wildcard]' : c.certType === 'apex' ? '[apex]   ' : '[single] '
        const expiry = c.expiryDate
          ? `expires ${new Date(c.expiryDate).toLocaleDateString()}`
          : 'no expiry info  '
        return `  ${pad(c.certName, maxNameLen)}  ${tag}  ${expiry}`
      }

      console.log(`\n  Found ${certs.length} certificate(s)\n`)

      if (active.length > 0) {
        console.log(`  ACTIVE (${active.length})`)
        active.forEach(c => console.log(fmt(c)))
        console.log('')
      }

      if (inactive.length > 0) {
        console.log(`  OTHER (${inactive.length})`)
        inactive.forEach(c => {
          const tag    = c.certType === 'wildcard' ? '[wildcard]' : c.certType === 'apex' ? '[apex]   ' : '[single] '
          console.log(`  ${pad(c.certName, maxNameLen)}  ${tag}  ${c.status}`)
        })
        console.log('')
      }
    } catch (err) {
      console.error(`\n  Error: ${(err as Error).message}\n`)
      process.exit(1)
    }
  })
