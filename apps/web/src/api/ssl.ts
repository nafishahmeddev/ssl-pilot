import { apiClient } from './client'
import type {
  ChallengeType,
  DomainsResponse,
  CertDetailResponse,
  InitiateSslResponse,
  VerifySslResponse,
  GenerateSslResponse,
  AdoptWildcardResponse,
  WildcardCheckResponse,
} from '../types/ssl'
import { ChallengeType as ChallengeTypeConst } from '../types/ssl'

export const getDomainsApi = async (): Promise<DomainsResponse> => {
  const response = await apiClient.get<DomainsResponse>('/api/ssl/domains')
  return response.data
}

export const getCertApi = async (id: string): Promise<CertDetailResponse> => {
  const response = await apiClient.get<CertDetailResponse>(`/api/ssl/certs/${id}`)
  return response.data
}

export const deleteCertApi = async (id: string): Promise<void> => {
  await apiClient.delete(`/api/ssl/certs/${id}`)
}

export const deleteDomainApi = async (id: string): Promise<void> => {
  await apiClient.delete(`/api/ssl/domains/${id}`)
}

export const checkWildcardApi = async (certName: string): Promise<WildcardCheckResponse> => {
  const response = await apiClient.get<WildcardCheckResponse>('/api/ssl/wildcard-check', {
    params: { certName },
  })
  return response.data
}

export const adoptWildcardApi = async (
  certName: string,
  wildcardCertId: string,
): Promise<AdoptWildcardResponse> => {
  const response = await apiClient.post<AdoptWildcardResponse>('/api/ssl/adopt-wildcard', {
    certName,
    wildcardCertId,
  })
  return response.data
}

export const initiateSslApi = async (
  certName: string,
  challengeType: ChallengeType = ChallengeTypeConst.DNS_01,
  skipWildcardCheck = false,
): Promise<InitiateSslResponse> => {
  const response = await apiClient.post<InitiateSslResponse>('/api/ssl/initiate', {
    certName,
    challengeType,
    skipWildcardCheck,
  })
  return response.data
}

export const verifySslApi = async (certName: string): Promise<VerifySslResponse> => {
  const response = await apiClient.post<VerifySslResponse>('/api/ssl/verify', { certName })
  return response.data
}

export const generateSslApi = async (certName: string): Promise<GenerateSslResponse> => {
  const response = await apiClient.post<GenerateSslResponse>('/api/ssl/generate', { certName })
  return response.data
}
