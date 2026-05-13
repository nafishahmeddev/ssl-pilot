import { mkdir, writeFile, chmod } from 'fs/promises'
import { join } from 'path'

const BASE_DIR = '/etc/ssl-pilot'

function domainDir(certName: string): string {
  const domain = certName.replace(/^\*\./, '')
  return join(BASE_DIR, domain)
}

export async function saveCert(
  certName: string,
  certPem: string,
  keyPem: string,
): Promise<{ certPath: string; keyPath: string }> {
  const dir      = domainDir(certName)
  const certPath = join(dir, 'certificate.crt')
  const keyPath  = join(dir, 'private.key')

  try {
    await mkdir(dir, { recursive: true })
  } catch (err) {
    handleFsError(err, certName, dir)
  }

  try {
    await writeFile(certPath, certPem, { encoding: 'utf8' })
    await chmod(certPath, 0o644)
  } catch (err) {
    handleFsError(err, certName, certPath)
  }

  try {
    // mode 0o600: owner read/write only — private key must not be world-readable
    await writeFile(keyPath, keyPem, { encoding: 'utf8', mode: 0o600 })
  } catch (err) {
    handleFsError(err, certName, keyPath)
  }

  return { certPath, keyPath }
}

function handleFsError(err: unknown, certName: string, path: string): never {
  const e = err as NodeJS.ErrnoException

  if (e.code === 'EACCES' || e.code === 'EPERM') {
    console.error(`\nPermission denied writing to: ${path}`)
    console.error(`${BASE_DIR} requires root access.\n`)
    console.error(`Re-run with sudo:\n`)

    const name = certName.startsWith('*.') ? `'${certName}'` : certName
    console.error(`  sudo ssl-pilot download ${name}\n`)
    process.exit(1)
  }

  throw err
}
