import input from '@inquirer/input'
import { readConfig } from './config.js'
import { createApiClient, type ApiClient } from './api.js'

export async function getConfiguredClient(): Promise<ApiClient> {
  let apiKey = process.env['SSL_PILOT_API_KEY']

  if (!apiKey) {
    if (!process.stdin.isTTY) {
      process.stderr.write('Error: SSL_PILOT_API_KEY is not set and no TTY is available for prompt.\n')
      process.stderr.write('  export SSL_PILOT_API_KEY=\'sslpilot_...\'\n\n')
      process.exit(1)
    }

    apiKey = await input({
      message: 'API key (sslpilot_...):',
      validate: (v) =>
        v.startsWith('sslpilot_') && v.length > 10
          ? true
          : 'Key must start with sslpilot_',
    })
  }

  const config = await readConfig()
  return createApiClient({ apiKey, apiUrl: config.apiUrl })
}
