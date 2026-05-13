import { apiClient } from './client'
import type {
  ChallengeType,
  InitiateSslResponse,
  VerifySslResponse,
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

export const verifySslApi = async (domain: string): Promise<VerifySslResponse> => {
  const response = await apiClient.post<VerifySslResponse>('/api/ssl/verify', { domain })
  return response.data
}

export const recheckSslApi = async (domain: string): Promise<VerifySslResponse> => {
  const response = await apiClient.post<VerifySslResponse>('/api/ssl/recheck', { domain })
  return response.data
}

export const deleteDomainApi = async (id: string): Promise<void> => {
  await apiClient.delete(`/api/ssl/domain/${id}`)
}
