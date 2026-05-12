import { useSelector } from '@tanstack/react-store'
import { authStore } from '../store/auth'
import { Navigate } from 'react-router-dom'
import type { ReactNode } from 'react'

export const ProtectedRoute = ({ children }: { children: ReactNode }) => {
  const isInitialized  = useSelector(authStore, (s) => s.isInitialized)
  const isAuthenticated = useSelector(authStore, (s) => s.isAuthenticated)

  // Wait for silent refresh to resolve before making any auth decision
  if (!isInitialized) {
    return (
      <div className="min-h-screen bg-base-200 flex items-center justify-center">
        <span className="loading loading-spinner loading-lg text-primary" />
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}
