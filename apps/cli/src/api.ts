const BASE_URL = (process.env['SSL_PILOT_API_URL'] ?? 'https://ssl.idexa.app').replace(/\/$/, '')

function getApiKey(): string {
  const key = process.env['SSL_PILOT_API_KEY']
  if (!key) {
    console.error('Error: SSL_PILOT_API_KEY environment variable is not set.')
    process.exit(1)
  }
  return key
}

function authHeaders(): Record<string, string> {
  return {
    'Authorization': `Bearer ${getApiKey()}`,
    'Content-Type': 'application/json',
  }
}

export interface CertInfo {
  _id: string
  certName: string
  certType: 'wildcard' | 'apex' | 'single'
  status: string
  expiryDate?: string
  issuedAt?: string
  challengeType?: string
}

export interface CertFiles {
  certName: string
  certPem: string
  keyPem: string
  expiryDate?: string
}

interface ApiResponse<T> {
  success: boolean
  data: T
  message: string
}

async function request<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}/api/cli${path}`, {
    headers: authHeaders(),
  })

  const body = (await res.json()) as ApiResponse<T>

  if (!res.ok || !body.success) {
    throw new Error(body.message ?? `HTTP ${res.status}`)
  }

  return body.data
}

export async function listCerts(): Promise<CertInfo[]> {
  const data = await request<{ certs: CertInfo[] }>('/certs')
  return data.certs
}

export async function downloadCert(id: string): Promise<CertFiles> {
  return request<CertFiles>(`/certs/${id}/download`)
}
