import { Command } from 'commander'
import { getConfiguredClient } from '../client.js'

export const listCommand = new Command('list')
  .description('List all certificates in your organisation')
  .action(async () => {
    try {
      const client = await getConfiguredClient()
      const certs = await client.listCerts()

      if (certs.length === 0) {
        console.log('No certificates found.')
        return
      }

      const active   = certs.filter(c => c.status === 'active')
      const inactive = certs.filter(c => c.status !== 'active')

      const fmt = (c: (typeof certs)[number]) => {
        const expiry = c.expiryDate
          ? `expires ${new Date(c.expiryDate).toLocaleDateString()}`
          : 'no expiry'
        const tag = c.certType === 'wildcard' ? ' [wildcard]' : c.certType === 'apex' ? ' [apex]' : ''
        return `  ${c.certName}${tag}  •  ${c.status}  •  ${expiry}  •  id: ${c._id}`
      }

      if (active.length > 0) {
        console.log(`\nActive (${active.length}):`)
        active.forEach(c => console.log(fmt(c)))
      }

      if (inactive.length > 0) {
        console.log(`\nOther (${inactive.length}):`)
        inactive.forEach(c => console.log(fmt(c)))
      }

      console.log('')
    } catch (err) {
      console.error(`Error: ${(err as Error).message}`)
      process.exit(1)
    }
  })
