import { Command } from 'commander'
import select from '@inquirer/select'
import { type ApiClient, type CertInfo } from '../api.js'
import { getConfiguredClient } from '../client.js'
import { saveCert } from '../files.js'

async function performDownload(cert: CertInfo, client: ApiClient): Promise<void> {
  console.log(`\n  Downloading ${cert.certName}…`)

  const files = await client.downloadCert(cert._id)
  const { certPath, keyPath } = await saveCert(files.certName, files.certPem, files.keyPem)

  console.log(`  ✓ Certificate : ${certPath}`)
  console.log(`  ✓ Private key : ${keyPath}`)
  if (files.expiryDate) {
    console.log(`  ✓ Expires     : ${new Date(files.expiryDate).toLocaleDateString()}`)
  }
  console.log('')
}

export const downloadCommand = new Command('download')
  .description('Download a certificate to /etc/ssl-pilot/<domain>/ (requires sudo)')
  .argument('[certName]', 'Certificate name (e.g. *.example.com)')
  .option('-i, --id <id>', 'Download by certificate ID')
  .action(async (certName: string | undefined, opts: { id?: string }) => {
    try {
      const client = await getConfiguredClient()

      if (opts.id) {
        const certs = await client.listCerts()
        const cert  = certs.find(c => c._id === opts.id)
        if (!cert) {
          console.error(`\n  Error: No certificate found with ID "${opts.id}"\n`)
          process.exit(1)
        }
        await performDownload(cert, client)
        return
      }

      const certs = await client.listCerts()

      if (certs.length === 0) {
        console.log('\n  No certificates found in your account.\n')
        return
      }

      if (certName) {
        const match = certs.find(c => c.certName === certName)
        if (!match) {
          console.error(`\n  Error: No certificate found for "${certName}"`)
          console.error('  Run "sp list" to see available certificates.\n')
          process.exit(1)
        }
        if (match.status !== 'active') {
          console.error(`\n  Error: "${certName}" is not active (status: ${match.status})\n`)
          process.exit(1)
        }
        await performDownload(match, client)
        return
      }

      // Interactive picker
      const active = certs.filter(c => c.status === 'active')

      if (active.length === 0) {
        console.log('\n  No active certificates available.\n')
        return
      }

      const chosen = await select<CertInfo>({
        message: 'Select a certificate to download:',
        choices: active.map(c => {
          const expiry = c.expiryDate
            ? `expires ${new Date(c.expiryDate).toLocaleDateString()}`
            : 'no expiry'
          const tag = c.certType === 'wildcard' ? ' [wildcard]' : c.certType === 'apex' ? ' [apex]' : ''
          return {
            name: `${c.certName}${tag}  —  ${expiry}`,
            value: c,
          }
        }),
      })

      await performDownload(chosen, client)
    } catch (err) {
      if ((err as NodeJS.ErrnoException).name === 'ExitPromptError') process.exit(0)
      console.error(`\n  Error: ${(err as Error).message}\n`)
      process.exit(1)
    }
  })
