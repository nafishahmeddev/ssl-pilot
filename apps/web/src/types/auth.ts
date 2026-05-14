import { z } from 'zod'
import type { ApiResponse } from './api'

/**
 * Validation schemas — the single source of truth for all credentials shapes.
 * Types are derived from these schemas to guarantee they always stay in sync.
 */

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
})

export const registerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  organizationName: z.string().min(2, 'Organization name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
})

export type LoginCredentials = z.infer<typeof loginSchema>
export type RegisterCredentials = z.infer<typeof registerSchema>

export type AuthResponse = ApiResponse<{
  accessToken: string
}>

export type RegisterResponse = ApiResponse<{
  accessToken: string
}>
