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

interface SuccessResponse<T> {
  data: T
  meta: { message?: string }
}

interface ErrorResponse {
  errors: { message: string; code: string }[]
  meta: { message?: string }
}

async function request<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}/api/cli${path}`, {
    headers: authHeaders(),
  })

  const body = (await res.json()) as SuccessResponse<T> | ErrorResponse

  if (!res.ok || 'errors' in body) {
    const errBody = body as ErrorResponse
    const msg = errBody.errors?.[0]?.message ?? `HTTP ${res.status}`
    throw new Error(msg)
  }

  return (body as SuccessResponse<T>).data
}

export async function listCerts(): Promise<CertInfo[]> {
  const data = await request<{ certs: CertInfo[] }>('/certs')
  return data.certs
}

export async function downloadCert(id: string): Promise<CertFiles> {
  return request<CertFiles>(`/certs/${id}/download`)
}
