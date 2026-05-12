import { useEffect } from 'react'
import { RouterProvider } from 'react-router-dom'
import { router } from './router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { refreshTokenApi } from './api/auth'
import { initializeAuth } from './store/auth'

const queryClient = new QueryClient()

function App() {
  useEffect(() => {
    // Attempt silent refresh on every page load.
    // Uses the httpOnly refresh-token cookie — no token stored in localStorage.
    // Sets isInitialized=true regardless of outcome so ProtectedRoute can decide.
    refreshTokenApi()
      .then((token) => initializeAuth(token))
      .catch(() => initializeAuth(null))
  }, [])

  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}

export default App
