import axios from 'axios'
import { apiClient, API_URL } from './client'
import type { LoginCredentials, AuthResponse, RegisterCredentials, RegisterResponse } from '../types/auth'
import type { ApiResponse } from '../types/api'

/**
 * API calls for Authentication.
 */

export const loginApi = async (data: LoginCredentials): Promise<AuthResponse> => {
  const response = await apiClient.post<AuthResponse>('/api/auth/login', data)
  return response.data
}

export const registerApi = async (data: RegisterCredentials): Promise<RegisterResponse> => {
  const response = await apiClient.post<RegisterResponse>('/api/auth/register', data)
  return response.data
}

export const logoutApi = async (): Promise<ApiResponse<null>> => {
  const response = await apiClient.post<ApiResponse<null>>('/api/auth/logout')
  return response.data
}

/** Silent refresh — uses raw axios (no interceptors) to avoid infinite 401 loop. */
export const refreshTokenApi = async (): Promise<string> => {
  const response = await axios.post<ApiResponse<{ accessToken: string }>>(
    `${API_URL}/api/auth/refresh`,
    {},
    { withCredentials: true }
  )
  return response.data.data.accessToken
}
