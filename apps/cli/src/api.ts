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

export interface ApiClient {
  listCerts(): Promise<CertInfo[]>
  downloadCert(id: string): Promise<CertFiles>
}

interface SuccessResponse<T> {
  data: T
  meta: { message?: string }
}

interface ErrorResponse {
  errors: { message: string; code: string }[]
  meta: { message?: string }
}

export function createApiClient(options: { apiKey: string; apiUrl?: string }): ApiClient {
  const base = (options.apiUrl ?? 'https://ssl.idexa.app').replace(/\/$/, '')

  async function request<T>(path: string): Promise<T> {
    const res = await fetch(`${base}/api/cli${path}`, {
      headers: {
        'Authorization': `Bearer ${options.apiKey}`,
        'Content-Type': 'application/json',
      },
    })

    const body = (await res.json()) as SuccessResponse<T> | ErrorResponse

    if (!res.ok || 'errors' in body) {
      const errBody = body as ErrorResponse
      const msg = errBody.errors?.[0]?.message ?? `HTTP ${res.status}`
      throw new Error(msg)
    }

    return (body as SuccessResponse<T>).data
  }

  return {
    async listCerts(): Promise<CertInfo[]> {
      const data = await request<{ certs: CertInfo[] }>('/certs')
      return data.certs
    },

    async downloadCert(id: string): Promise<CertFiles> {
      return request<CertFiles>(`/certs/${id}/download`)
    },
  }
}
