import { Command } from 'commander'
import select from '@inquirer/select'
import { type ApiClient, type CertInfo } from '../api.js'
import { getConfiguredClient } from '../client.js'
import { saveCert } from '../files.js'

async function performDownload(cert: CertInfo, client: ApiClient): Promise<void> {
  process.stdout.write(`\nDownloading ${cert.certName}…\n`)

  const files              = await client.downloadCert(cert._id)
  const { certPath, keyPath } = await saveCert(files.certName, files.certPem, files.keyPem)

  process.stdout.write(`  ✓ Certificate : ${certPath}\n`)
  process.stdout.write(`  ✓ Private key : ${keyPath}\n`)
  if (files.expiryDate) {
    process.stdout.write(`  ✓ Expires     : ${new Date(files.expiryDate).toLocaleDateString()}\n`)
  }
  process.stdout.write('\n')
}

export const downloadCommand = new Command('download')
  .description('Download a certificate to /etc/ssl-pilot/certs/<domain>/ — requires sudo')
  .argument('[certName]', 'Certificate name, e.g. *.example.com (omit to pick interactively)')
  .option('-i, --id <id>', 'Download by certificate ID')
  .addHelpText('after', `
Examples:
  sudo sp download                         Interactive picker
  sudo sp download '*.example.com'         By domain name
  sudo sp download --id 6643abc...         By certificate ID
`)
  .action(async (certName: string | undefined, opts: { id?: string }) => {
    const DOWNLOADABLE = new Set(['active', 'renewing'])

    try {
      const client = await getConfiguredClient()

      if (opts.id) {
        const certs = await client.listCerts()
        const cert  = certs.find(c => c._id === opts.id)
        if (!cert) {
          process.stderr.write(`\nError: no certificate found with ID "${opts.id}"\n\n`)
          process.exit(1)
        }
        await performDownload(cert, client)
        return
      }

      const certs = await client.listCerts()

      if (certs.length === 0) {
        process.stdout.write('\nNo certificates found in your account.\n\n')
        return
      }

      if (certName) {
        const match = certs.find(c => c.certName === certName)
        if (!match) {
          process.stderr.write(`\nError: no certificate found for "${certName}"\n`)
          process.stderr.write('Run "sp list" to see available certificates.\n\n')
          process.exit(1)
        }
        if (!DOWNLOADABLE.has(match.status)) {
          process.stderr.write(`\nError: "${certName}" is not available for download (status: ${match.status})\n\n`)
          process.exit(1)
        }
        await performDownload(match, client)
        return
      }

      const active = certs.filter(c => DOWNLOADABLE.has(c.status))

      if (active.length === 0) {
        process.stdout.write('\nNo active certificates available.\n\n')
        return
      }

      const chosen = await select<CertInfo>({
        message: 'Select a certificate to download:',
        choices: active.map(c => {
          const expiry = c.expiryDate
            ? `expires ${new Date(c.expiryDate).toLocaleDateString()}`
            : 'no expiry'
          const renewingTag = c.status === 'renewing' ? ' [renewing]' : ''
          const tag = c.certType === 'wildcard' ? ' [wildcard]' : c.certType === 'apex' ? ' [apex]' : ''
          return {
            name: `${c.certName}${tag}${renewingTag}  —  ${expiry}`,
            value: c,
          }
        }),
      })

      await performDownload(chosen, client)
    } catch (err) {
      if ((err as NodeJS.ErrnoException).name === 'ExitPromptError') process.exit(0)
      process.stderr.write(`\nError: ${(err as Error).message}\n\n`)
      process.exit(1)
    }
  })
