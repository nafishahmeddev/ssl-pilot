import { createBrowserRouter, Navigate } from 'react-router-dom'
import AppLayout from './components/layout/AppLayout'
import { ProtectedRoute } from './components/ProtectedRoute'

// Best practice for React Router v6 with code splitting:
// Use the `lazy` property on the route definition instead of React.lazy.
// This keeps component definitions out of the router file, satisfying Fast Refresh.

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Navigate to="/dashboard" replace />,
  },
  {
    path: '/login',
    lazy: async () => {
      const { default: Component } = await import('./pages/Login')
      return { Component }
    },
  },
  {
    path: '/register',
    lazy: async () => {
      const { default: Component } = await import('./pages/Register')
      return { Component }
    },
  },
  {
    element: (
      <ProtectedRoute>
        <AppLayout />
      </ProtectedRoute>
    ),
    children: [
      {
        path: '/dashboard',
        lazy: async () => {
          const { default: Component } = await import('./pages/Dashboard')
          return { Component }
        },
      },
      {
        path: '/certificates',
        lazy: async () => {
          const { default: Component } = await import('./pages/Certificates')
          return { Component }
        },
      },
      {
        path: '/certificates/new',
        lazy: async () => {
          const { default: Component } = await import('./pages/NewCertificate')
          return { Component }
        },
      },
      {
        path: '/certs/:id',
        lazy: async () => {
          const { default: Component } = await import('./pages/CertDetail')
          return { Component }
        },
      },
      {
        path: '/profile',
        lazy: async () => {
          const { default: Component } = await import('./pages/Profile')
          return { Component }
        },
      },
    ],
  },
])
