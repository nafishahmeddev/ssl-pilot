import { createFactory } from 'hono/factory'
import { isValidObjectId } from 'mongoose'
import type { Context } from 'hono'
import { CertificateModel } from '@src/models/certificate.model'
import { ApiKeyModel, generateApiKey, hashApiKey } from '@src/models/apikey.model'
import { ApiResponse } from '@src/shared/utils/response'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import type { Env } from '@src/app'

const factory = createFactory<Env>()

function badId(c: Context, label: string) {
  return ApiResponse.error(c, `Invalid ${label} ID.`, 'INVALID_ID', 400)
}

// ── List certs (no PEM) ───────────────────────────────────────────────────────

export const cliListCertsHandler = factory.createHandlers(async (c) => {
  const orgId = c.get('organizationId')

  try {
    const certs = await CertificateModel.find({ organizationId: orgId })
      .select('certName certType status expiryDate issuedAt challengeType')
      .sort({ certName: 1 })
      .lean()

    return ApiResponse.success(c, { certs }, 'Certificates fetched.')
  } catch (error: unknown) {
    return ApiResponse.error(c, (error as Error).message, 'LIST_ERROR', 500)
  }
})

// ── Download cert PEM by ID ───────────────────────────────────────────────────

export const cliDownloadCertHandler = factory.createHandlers(async (c) => {
  const id    = c.req.param('id')
  const orgId = c.get('organizationId')

  if (!isValidObjectId(id)) return badId(c, 'certificate')

  try {
    const cert = await CertificateModel.findOne(
      { _id: id, organizationId: orgId, status: 'active' },
      { certName: 1, certPem: 1, keyPem: 1, expiryDate: 1 },
    ).lean()

    if (!cert) {
      return ApiResponse.error(c, 'Certificate not found or not active.', 'NOT_FOUND', 404)
    }
    if (!cert.certPem || !cert.keyPem) {
      return ApiResponse.error(c, 'Certificate files not yet available.', 'NO_FILES', 404)
    }

    return ApiResponse.success(c, {
      certName:   cert.certName,
      certPem:    cert.certPem,
      keyPem:     cert.keyPem,
      expiryDate: cert.expiryDate,
    }, 'Certificate downloaded.')
  } catch (error: unknown) {
    return ApiResponse.error(c, (error as Error).message, 'DOWNLOAD_ERROR', 500)
  }
})

// ── API key management (JWT-protected, used by panel) ────────────────────────

const createApiKeySchema = z.object({
  name: z.string().min(1).max(64),
})

export const createApiKeyHandler = factory.createHandlers(
  zValidator('json', createApiKeySchema),
  async (c) => {
    const orgId = c.get('organizationId')
    const { name } = c.req.valid('json')

    const plainKey = generateApiKey()
    const keyHash  = hashApiKey(plainKey)

    await ApiKeyModel.create({ keyHash, organizationId: orgId, name })

    // Return plaintext key once — never stored, only hash kept
    return ApiResponse.success(c, { key: plainKey, name }, 'API key created. Save it — shown once.', 201)
  },
)

export const listApiKeysHandler = factory.createHandlers(async (c) => {
  const orgId = c.get('organizationId')

  const keys = await ApiKeyModel.find({ organizationId: orgId })
    .select('name lastUsedAt createdAt')
    .sort({ createdAt: -1 })
    .lean()

  return ApiResponse.success(c, { keys }, 'API keys fetched.')
})

export const deleteApiKeyHandler = factory.createHandlers(async (c) => {
  const id    = c.req.param('id')
  const orgId = c.get('organizationId')

  if (!isValidObjectId(id)) return badId(c, 'API key')

  const deleted = await ApiKeyModel.findOneAndDelete({ _id: id, organizationId: orgId })
  if (!deleted) return ApiResponse.error(c, 'API key not found.', 'NOT_FOUND', 404)

  return ApiResponse.success(c, null, 'API key revoked.')
})
