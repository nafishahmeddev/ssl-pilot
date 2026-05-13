import { readConfig } from './config.js'
import { createApiClient, type ApiClient } from './api.js'

export async function getConfiguredClient(): Promise<ApiClient> {
  const apiKey = process.env['SSL_PILOT_API_KEY']

  if (!apiKey) {
    console.error('Error: SSL_PILOT_API_KEY environment variable is not set.')
    console.error('  export SSL_PILOT_API_KEY=\'sslpilot_...\'\n')
    process.exit(1)
  }

  const config = await readConfig()
  return createApiClient({ apiKey, apiUrl: config.apiUrl })
}
