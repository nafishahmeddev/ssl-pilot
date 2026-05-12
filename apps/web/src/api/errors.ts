import { AxiosError } from 'axios'
import type { ApiErrorResponse } from '../types/api'

export const getApiError = (error: unknown, fallback = 'Something went wrong'): string => {
  if (error instanceof AxiosError) {
    const data = error.response?.data as ApiErrorResponse | undefined
    return data?.errors?.[0]?.message ?? fallback
  }
  return fallback
}
