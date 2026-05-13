import { Command } from 'commander'
import select from '@inquirer/select'
import { listCerts, downloadCert, type CertInfo } from '../api.js'
import { saveCert } from '../files.js'

async function performDownload(cert: CertInfo): Promise<void> {
  console.log(`\nDownloading ${cert.certName}…`)

  const files = await downloadCert(cert._id)
  const { certPath, keyPath } = await saveCert(files.certName, files.certPem, files.keyPem)

  console.log(`Certificate saved to: ${certPath}`)
  console.log(`Private key saved to: ${keyPath}`)
  if (files.expiryDate) {
    console.log(`Expires: ${new Date(files.expiryDate).toLocaleDateString()}`)
  }
  console.log('')
}

export const downloadCommand = new Command('download')
  .description('Download a certificate to /etc/ssl-pilot/<domain>/')
  .argument('[certName]', 'Certificate name to download (e.g. *.example.com or api.example.com)')
  .option('-i, --id <id>', 'Download by certificate ID directly')
  .action(async (certName: string | undefined, opts: { id?: string }) => {
    try {
      // Direct by ID
      if (opts.id) {
        const certs = await listCerts()
        const cert  = certs.find(c => c._id === opts.id)
        if (!cert) {
          console.error(`Error: No certificate found with ID ${opts.id}`)
          process.exit(1)
        }
        await performDownload(cert)
        return
      }

      const certs = await listCerts()

      if (certs.length === 0) {
        console.log('No certificates found.')
        return
      }

      // Direct by certName param
      if (certName) {
        const match = certs.find(c => c.certName === certName)
        if (!match) {
          console.error(`Error: No certificate found for "${certName}"`)
          console.error(`Run "ssl-pilot list" to see available certificates.`)
          process.exit(1)
        }
        if (match.status !== 'active') {
          console.error(`Error: Certificate "${certName}" is not active (status: ${match.status})`)
          process.exit(1)
        }
        await performDownload(match)
        return
      }

      // Interactive mode — pick from list
      const active = certs.filter(c => c.status === 'active')

      if (active.length === 0) {
        console.log('No active certificates available for download.')
        return
      }

      const chosen = await select<CertInfo>({
        message: 'Select a certificate to download:',
        choices: active.map(c => {
          const expiry = c.expiryDate
            ? `  expires ${new Date(c.expiryDate).toLocaleDateString()}`
            : ''
          const tag = c.certType === 'wildcard' ? ' [wildcard]' : c.certType === 'apex' ? ' [apex]' : ''
          return {
            name: `${c.certName}${tag}${expiry}`,
            value: c,
          }
        }),
      })

      await performDownload(chosen)
    } catch (err) {
      // inquirer throws if user hits Ctrl+C
      if ((err as NodeJS.ErrnoException).name === 'ExitPromptError') {
        process.exit(0)
      }
      console.error(`Error: ${(err as Error).message}`)
      process.exit(1)
    }
  })
