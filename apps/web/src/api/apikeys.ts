import { apiClient } from './client'
import type { ApiResponse } from '../types/api'

export interface ApiKeyRecord {
  _id: string
  name: string
  lastUsedAt?: string
  createdAt: string
}

export interface CreatedApiKey {
  key: string
  name: string
}

export const listApiKeysApi = async (): Promise<ApiResponse<{ keys: ApiKeyRecord[] }>> => {
  const response = await apiClient.get<ApiResponse<{ keys: ApiKeyRecord[] }>>('/api/cli/api-keys')
  return response.data
}

export const createApiKeyApi = async (name: string): Promise<ApiResponse<CreatedApiKey>> => {
  const response = await apiClient.post<ApiResponse<CreatedApiKey>>('/api/cli/api-keys', { name })
  return response.data
}

export const deleteApiKeyApi = async (id: string): Promise<void> => {
  await apiClient.delete(`/api/cli/api-keys/${id}`)
}
