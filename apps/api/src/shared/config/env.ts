import { z } from 'zod'

/**
 * Schema for validating environment variables.
 */
const envSchema = z.object({
  PORT: z.string().regex(/^\d+$/).default('3000').transform(Number),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  MONGODB_URI: z.string().url('Invalid MongoDB URI').default('mongodb://localhost:27017/ssl-pilot'),
  ACME_STAGING: z.string().default('true').transform((v) => v === 'true'),
  VAULT_MASTER_KEY: z.string().length(64, 'Vault master key must be 64 hex characters'),
  JWT_ACCESS_SECRET: z.string().min(16, 'JWT_ACCESS_SECRET must be at least 16 characters').default('access-secret-change-me-in-prod'),
  JWT_REFRESH_SECRET: z.string().min(16, 'JWT_REFRESH_SECRET must be at least 16 characters').default('refresh-secret-change-me-in-prod'),
  FRONTEND_URL: z.string().url('FRONTEND_URL must be a valid URL').default('http://localhost:5173'),
})

const parsedEnv = envSchema.safeParse(process.env)

if (!parsedEnv.success) {
  console.error('❌ Invalid environment variables:', parsedEnv.error.format())
  process.exit(1)
}

const { data } = parsedEnv

if (data.NODE_ENV === 'production') {
  const insecureDefaults = [
    [data.JWT_ACCESS_SECRET,  'access-secret-change-me-in-prod',  'JWT_ACCESS_SECRET'],
    [data.JWT_REFRESH_SECRET, 'refresh-secret-change-me-in-prod', 'JWT_REFRESH_SECRET'],
  ] as const
  for (const [val, def, name] of insecureDefaults) {
    if (val === def) {
      console.error(`🚨 SECURITY: ${name} is using the insecure default value in production. Set a strong secret.`)
      process.exit(1)
    }
  }
  if (data.ACME_STAGING) {
    console.warn('⚠️  WARNING: ACME_STAGING=true in production — issued certificates will NOT be trusted by browsers.')
  }
}

/**
 * Type-safe environment variables.
 */
export const env = data
