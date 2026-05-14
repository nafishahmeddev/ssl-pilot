import { spawn } from 'child_process'
import { access } from 'fs/promises'
import { join } from 'path'
import { HOOKS_DIR } from './config.js'

const GLOBAL_HOOK = join(HOOKS_DIR, 'global.sh')

function domainHookPath(certName: string): string {
  const safe = certName.replace(/^\*\./, 'wildcard.')
  return join(HOOKS_DIR, `${safe}.sh`)
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function execHook(scriptPath: string, vars: Record<string, string>): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('bash', [scriptPath], {
      env: { ...process.env, ...vars },
      stdio: 'inherit',
    })
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`Hook exited with code ${code}`))
    })
    child.on('error', reject)
  })
}

export async function runHooks(
  certName: string,
  vars: Record<string, string>,
  log: (msg: string) => void,
): Promise<void> {
  const domainHook = domainHookPath(certName)
  const hookVars   = { ...vars, SSL_PILOT_CERT_NAME: certName }

  if (await fileExists(domainHook)) {
    log(`  Running domain hook: ${domainHook}`)
    try {
      await execHook(domainHook, hookVars)
      log('  Domain hook OK')
    } catch (err) {
      log(`  Domain hook failed: ${(err as Error).message}`)
    }
  }

  if (await fileExists(GLOBAL_HOOK)) {
    log(`  Running global hook: ${GLOBAL_HOOK}`)
    try {
      await execHook(GLOBAL_HOOK, hookVars)
      log('  Global hook OK')
    } catch (err) {
      log(`  Global hook failed: ${(err as Error).message}`)
    }
  }
}

export { domainHookPath, GLOBAL_HOOK }
