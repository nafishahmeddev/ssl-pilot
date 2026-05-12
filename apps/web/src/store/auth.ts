import { createStore } from '@tanstack/react-store'

export interface AuthState {
  accessToken: string | null
  isAuthenticated: boolean
  isInitialized: boolean
}

export const authStore = createStore<AuthState>({
  accessToken: null,
  isAuthenticated: false,
  isInitialized: false,
})

export const setAccessToken = (token: string | null) => {
  authStore.setState((state) => ({
    ...state,
    accessToken: token,
    isAuthenticated: !!token,
  }))
}

/** Called once on app boot after the silent-refresh attempt resolves. */
export const initializeAuth = (token: string | null) => {
  authStore.setState((state) => ({
    ...state,
    accessToken: token,
    isAuthenticated: !!token,
    isInitialized: true,
  }))
}
