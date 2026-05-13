import { apiClient } from './client'
import type {
  ChallengeType,
  InitiateSslResponse,
  VerifySslResponse,
  GenerateSslResponse,
  CertificatesResponse,
  DomainDetailResponse,
} from '../types/ssl'
import { ChallengeType as ChallengeTypeConst } from '../types/ssl'

export const getCertificatesApi = async (): Promise<CertificatesResponse> => {
  const response = await apiClient.get<CertificatesResponse>('/api/ssl/certificates')
  return response.data
}

export const getDomainApi = async (id: string): Promise<DomainDetailResponse> => {
  const response = await apiClient.get<DomainDetailResponse>(`/api/ssl/domain/${id}`)
  return response.data
}

export const initiateSslApi = async (
  domain: string,
  challengeType: ChallengeType = ChallengeTypeConst.DNS_01,
): Promise<InitiateSslResponse> => {
  const response = await apiClient.post<InitiateSslResponse>('/api/ssl/initiate', { domain, challengeType })
  return response.data
}

/** Step 2 — tell ACME to validate the DNS/HTTP challenge. */
export const verifySslApi = async (domain: string): Promise<VerifySslResponse> => {
  const response = await apiClient.post<VerifySslResponse>('/api/ssl/verify', { domain })
  return response.data
}

/** Step 3 — finalise the order and issue the certificate. */
export const generateSslApi = async (domain: string): Promise<GenerateSslResponse> => {
  const response = await apiClient.post<GenerateSslResponse>('/api/ssl/generate', { domain })
  return response.data
}

export const deleteDomainApi = async (id: string): Promise<void> => {
  await apiClient.delete(`/api/ssl/domain/${id}`)
}
