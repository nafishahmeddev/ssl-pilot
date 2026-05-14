import { mkdir, writeFile, chmod } from 'fs/promises'
import { join } from 'path'
import { SSL_PILOT_DIR } from './config.js'

function domainDir(certName: string): string {
  return join(SSL_PILOT_DIR, certName.replace(/^\*\./, ''))
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
    fsError(err, certName, dir)
  }

  try {
    await writeFile(certPath, certPem, 'utf8')
    await chmod(certPath, 0o644)
  } catch (err) {
    fsError(err, certName, certPath)
  }

  try {
    await writeFile(keyPath, keyPem, 'utf8')
    await chmod(keyPath, 0o600)
  } catch (err) {
    fsError(err, certName, keyPath)
  }

  return { certPath, keyPath }
}

function fsError(err: unknown, certName: string, path: string): never {
  const e = err as NodeJS.ErrnoException

  if (e.code === 'EACCES' || e.code === 'EPERM') {
    const name = certName.startsWith('*.') ? `'${certName}'` : certName
    process.stderr.write(`\nPermission denied: ${path}\n`)
    process.stderr.write(`/etc/ssl-pilot requires root. Re-run:\n\n`)
    process.stderr.write(`  sudo sp download ${name}\n\n`)
    process.exit(1)
  }

  throw err
}
