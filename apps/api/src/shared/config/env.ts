import { z } from 'zod'

/**
 * Schema for validating environment variables.
 */
const envSchema = z.object({
  PORT: z.string().regex(/^\d+$/).default('3000').transform(Number),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  MONGODB_URI: z.string().url('Invalid MongoDB URI').default('mongodb://localhost:27017/ssl-pilot'),
  ACME_EMAIL: z.string().email('Invalid ACME email'),
  ACME_STAGING: z.string().default('true').transform((v) => v === 'true'),
  VAULT_MASTER_KEY: z.string().length(64, 'Vault master key must be 64 hex characters'),
  JWT_ACCESS_SECRET: z.string().default('access-secret-change-me-in-prod'),
  JWT_REFRESH_SECRET: z.string().default('refresh-secret-change-me-in-prod'),
  FRONTEND_URL: z.string().url('FRONTEND_URL must be a valid URL').default('http://localhost:5173'),
  ACME_ACCOUNT_KEY: z.string().optional(),
})

const parsedEnv = envSchema.safeParse(process.env)

if (!parsedEnv.success) {
  console.error('❌ Invalid environment variables:', parsedEnv.error.format())
  process.exit(1)
}

/**
 * Type-safe environment variables.
 */
export const env = parsedEnv.data
