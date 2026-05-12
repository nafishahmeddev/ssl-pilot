import axios from 'axios'
import { authStore, setAccessToken } from '../store/auth'

export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

export const apiClient = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
})

// Attach access token to every request
apiClient.interceptors.request.use(
  (config) => {
    const { accessToken } = authStore.state
    if (accessToken) {
      config.headers.Authorization = `Bearer ${accessToken}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

interface QueuedPromise {
  resolve: (token: string | null) => void
  reject: (error: unknown) => void
}

let isRefreshing = false
let failedQueue: QueuedPromise[] = []

const processQueue = (error: unknown, token: string | null = null) => {
  failedQueue.forEach((p) => (error ? p.reject(error) : p.resolve(token)))
  failedQueue = []
}

// On 401: attempt token refresh once, then retry or redirect to login
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject })
        })
          .then((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`
            return apiClient(originalRequest)
          })
          .catch((err) => Promise.reject(err))
      }

      originalRequest._retry = true
      isRefreshing = true

      try {
        const res = await axios.post<{ data: { accessToken: string } }>(
          `${API_URL}/api/auth/refresh`,
          {},
          { withCredentials: true }
        )
        const { accessToken } = res.data.data

        setAccessToken(accessToken)
        processQueue(null, accessToken)

        originalRequest.headers.Authorization = `Bearer ${accessToken}`
        return apiClient(originalRequest)
      } catch (refreshError) {
        processQueue(refreshError, null)
        setAccessToken(null)
        window.location.replace('/login')
        return Promise.reject(refreshError)
      } finally {
        isRefreshing = false
      }
    }

    return Promise.reject(error)
  }
)
