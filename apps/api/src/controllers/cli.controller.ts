import { createFactory } from 'hono/factory'
import { isValidObjectId } from 'mongoose'
import type { Context } from 'hono'
import { CertificateModel } from '@src/models/certificate.model'
import { ApiKeyModel, generateApiKey, hashApiKey } from '@src/models/apikey.model'
import { ApiResponse, errMsg } from '@src/shared/utils/response'
import { logger } from '@src/shared/utils/logger'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import type { Env } from '@src/app'

const factory = createFactory<Env>()

function badId(c: Context, label: string) {
  return ApiResponse.error(c, `Invalid ${label} ID.`, 'INVALID_ID', 400)
}

// ── List certs (no PEM) ───────────────────────────────────────────────────────

/**
 * GET /api/cli/certs
 * Returns all org certificates without PEM data. Used by the CLI daemon to
 * decide which certs need downloading or renewal tracking.
 */
export const cliListCertsHandler = factory.createHandlers(async (c) => {
  const orgId = c.get('organizationId')

  try {
    const certs = await CertificateModel.find({ organizationId: orgId })
      .select('certName certType status expiryDate issuedAt challengeType')
      .sort({ certName: 1 })
      .lean()

    logger.debug({ orgId, count: certs.length }, 'CLI: certs listed')
    return ApiResponse.success(c, { certs }, 'Certificates fetched.')
  } catch (error: unknown) {
    logger.error({ error, orgId }, 'CLI: list certs failed')
    return ApiResponse.error(c, errMsg(error), 'LIST_ERROR', 500)
  }
})

// ── Download cert PEM by ID ───────────────────────────────────────────────────

/**
 * GET /api/cli/certs/:id/download
 * Returns the full PEM cert + key for a valid, unexpired certificate.
 * Only active or renewing certs with a non-expired `expiryDate` are served.
 */
export const cliDownloadCertHandler = factory.createHandlers(async (c) => {
  const id    = c.req.param('id')
  const orgId = c.get('organizationId')

  if (!isValidObjectId(id)) return badId(c, 'certificate')

  const DOWNLOADABLE_STATUSES = ['active', 'renewing', 'pending_challenge', 'challenge_verified'] as const

  try {
    const cert = await CertificateModel.findOne(
      { _id: id, organizationId: orgId, status: { $in: DOWNLOADABLE_STATUSES }, expiryDate: { $gt: new Date() } },
      { certName: 1, certPem: 1, keyPem: 1, expiryDate: 1 },
    ).lean()

    if (!cert) {
      logger.warn({ certId: id, orgId }, 'CLI: download — cert not found or expired')
      return ApiResponse.error(c, 'Certificate not found or no longer valid.', 'NOT_FOUND', 404)
    }
    if (!cert.certPem || !cert.keyPem) {
      logger.warn({ certId: id, certName: cert.certName, orgId }, 'CLI: download — PEM files not yet available')
      return ApiResponse.error(c, 'Certificate files not yet available.', 'NO_FILES', 404)
    }

    logger.info({ certId: id, certName: cert.certName, orgId, expiryDate: cert.expiryDate }, 'CLI: cert downloaded')
    return ApiResponse.success(c, {
      certName:   cert.certName,
      certPem:    cert.certPem,
      keyPem:     cert.keyPem,
      expiryDate: cert.expiryDate,
    }, 'Certificate downloaded.')
  } catch (error: unknown) {
    logger.error({ error, certId: id, orgId }, 'CLI: download cert failed')
    return ApiResponse.error(c, errMsg(error), 'DOWNLOAD_ERROR', 500)
  }
})

// ── API key management (JWT-protected, used by panel) ────────────────────────

const createApiKeySchema = z.object({
  name: z.string().min(1).max(64),
})

/**
 * POST /api/cli/api-keys
 * Generates a new API key for the org. The plaintext key is returned once and
 * never stored — only a SHA-256 hash is persisted.
 */
export const createApiKeyHandler = factory.createHandlers(
  zValidator('json', createApiKeySchema),
  async (c) => {
    const orgId = c.get('organizationId')
    const { name } = c.req.valid('json')

    const plainKey = generateApiKey()
    const keyHash  = hashApiKey(plainKey)

    await ApiKeyModel.create({ keyHash, organizationId: orgId, name })

    logger.info({ orgId, keyName: name }, 'CLI: API key created')
    return ApiResponse.success(c, { key: plainKey, name }, 'API key created. Save it — shown once.', 201)
  },
)

/**
 * GET /api/cli/api-keys
 * Lists all API keys for the org (name + usage metadata, no secrets).
 */
export const listApiKeysHandler = factory.createHandlers(async (c) => {
  const orgId = c.get('organizationId')

  const keys = await ApiKeyModel.find({ organizationId: orgId })
    .select('name lastUsedAt createdAt')
    .sort({ createdAt: -1 })
    .lean()

  return ApiResponse.success(c, { keys }, 'API keys fetched.')
})

/**
 * DELETE /api/cli/api-keys/:id
 * Revokes (hard-deletes) an API key. The CLI daemon will be denied on next use.
 */
export const deleteApiKeyHandler = factory.createHandlers(async (c) => {
  const id    = c.req.param('id')
  const orgId = c.get('organizationId')

  if (!isValidObjectId(id)) return badId(c, 'API key')

  const deleted = await ApiKeyModel.findOneAndDelete({ _id: id, organizationId: orgId })
  if (!deleted) return ApiResponse.error(c, 'API key not found.', 'NOT_FOUND', 404)

  logger.info({ orgId, keyId: id, keyName: deleted.name }, 'CLI: API key revoked')
  return ApiResponse.success(c, null, 'API key revoked.')
})
