import { apiClient } from './client'
import type { InitiateSslResponse, VerifySslResponse } from '../types/ssl'

export const initiateSslApi = async (domain: string): Promise<InitiateSslResponse> => {
  const response = await apiClient.post<InitiateSslResponse>('/api/ssl/initiate', { domain })
  return response.data
}

export const verifySslApi = async (domain: string): Promise<VerifySslResponse> => {
  const response = await apiClient.post<VerifySslResponse>('/api/ssl/verify', { domain })
  return response.data
}
