import { createFactory } from 'hono/factory'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { isValidObjectId } from 'mongoose'
import { acmeService } from '@src/services/acme.service'
import { DomainModel, getPotentialWildcard } from '@src/models/domain.model'
import { CertificateModel, ChallengeType } from '@src/models/certificate.model'
import { ApiResponse, errMsg } from '@src/shared/utils/response'
import type { Env } from '@src/app'
import type { Context } from 'hono'

const factory = createFactory<Env>()

function badId(c: Context, label: string) {
  return ApiResponse.error(c, `Invalid ${label} ID.`, 'INVALID_ID', 400)
}

/**
 * Validates a fully-qualified domain name with optional wildcard prefix.
 * Accepts: example.com, sub.example.com, *.example.com
 * Rejects: *.*.example.com, -example.com, bare labels
 */
const FQDN_REGEX = /^(\*\.)?([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/

const fqdnField = z
  .string()
  .min(3)
  .max(255)
  .refine((d) => FQDN_REGEX.test(d), {
    message: 'Invalid domain. Use example.com, sub.example.com, or *.example.com.',
  })

const certNameSchema = z.object({ certName: fqdnField })
const initiateSchema = z.object({
  certName:          fqdnField,
  skipWildcardCheck: z.boolean().default(false),
})
const verifySchema = z.object({
  certName:      fqdnField,
  challengeType: z.enum([ChallengeType.DNS_01, ChallengeType.HTTP_01]),
})

// ── Wildcard coverage check ───────────────────────────────────────────────────

/**
 * GET /api/ssl/wildcard-check?certName=api.idexa.app
 * Read-only. Checks if an active wildcard cert in this org covers the given name.
 * Frontend calls this before initiating to offer the instant-adoption shortcut.
 */
export const wildcardCheckHandler = factory.createHandlers(
  zValidator('query', z.object({ certName: fqdnField })),
  async (c) => {
    const { certName } = c.req.valid('query')
    const orgId = c.get('organizationId')

    const potentialWildcard = getPotentialWildcard(certName)
    if (!potentialWildcard) {
      return ApiResponse.success(c, { covered: false }, 'No wildcard can cover this domain.')
    }

    const wildcard = await CertificateModel.findOne(
      {
        certName:       potentialWildcard,
        organizationId: orgId,
        status:         { $in: ['active', 'renewing'] },
        expiryDate:     { $gt: new Date() },
      },
      { _id: 1, certName: 1, expiryDate: 1 },
    ).lean()

    if (!wildcard) {
      return ApiResponse.success(c, { covered: false }, 'No active wildcard found.')
    }

    return ApiResponse.success(c, {
      covered: true,
      wildcard: {
        id:         wildcard._id.toString(),
        certName:   wildcard.certName,
        expiryDate: wildcard.expiryDate?.toISOString(),
      },
    }, `Covered by active wildcard ${potentialWildcard}.`)
  },
)

// ── Wildcard adoption ─────────────────────────────────────────────────────────

/**
 * POST /api/ssl/adopt-wildcard
 * Instantly activates a subdomain by copying the cert/key from an existing
 * active wildcard certificate. No ACME order is created.
 */
export const adoptWildcardHandler = factory.createHandlers(
  zValidator('json', z.object({
    certName:       fqdnField,
    wildcardCertId: z.string().min(1),
  })),
  async (c) => {
    const { certName, wildcardCertId } = c.req.valid('json')
    const orgId = c.get('organizationId')

    if (certName.startsWith('*.')) {
      return ApiResponse.error(c, 'Wildcards cannot adopt other wildcards.', 'INVALID_CERT', 400)
    }
    if (!getPotentialWildcard(certName)) {
      return ApiResponse.error(c, 'Apex domains cannot be covered by a wildcard.', 'NOT_COVERABLE', 400)
    }

    const existing = await CertificateModel.findOne(
      { certName, organizationId: orgId },
      { status: 1, expiryDate: 1 },
    ).lean()

    if (existing?.status === 'active' && (!existing.expiryDate || existing.expiryDate > new Date())) {
      return ApiResponse.error(c, 'Certificate already active. Delete it first to replace it.', 'CERT_ALREADY_ACTIVE', 409)
    }

    try {
      const result = await acmeService.adoptWildcard(certName, orgId, wildcardCertId)
      return ApiResponse.success(c, result, 'Certificate activated via wildcard.')
    } catch (error: unknown) {
      return ApiResponse.error(c, errMsg(error), 'ADOPT_ERROR', 500)
    }
  },
)

// ── Initiate ACME order ───────────────────────────────────────────────────────

/**
 * POST /api/ssl/initiate
 * Creates a new ACME order for a cert name.
 * Rejects if an active wildcard already covers this cert (use adopt-wildcard instead).
 */
export const initiateSslHandler = factory.createHandlers(
  zValidator('json', initiateSchema),
  async (c) => {
    const { certName, skipWildcardCheck } = c.req.valid('json')
    const orgId = c.get('organizationId')
    const email = c.get('userEmail')

    const existing = await CertificateModel.findOne(
      { certName, organizationId: orgId },
      { status: 1, expiryDate: 1, renewalError: 1 },
    ).lean()

    if (existing) {
      if (existing.status === 'renewing' && !existing.renewalError) {
        return ApiResponse.error(
          c,
          'Auto-renewal is in progress. It will complete automatically.',
          'RENEWAL_IN_PROGRESS',
          409,
        )
      }
      if (existing.status === 'active' && (!existing.expiryDate || existing.expiryDate > new Date())) {
        return ApiResponse.error(
          c,
          'Certificate is already active. Delete it first or wait for expiry.',
          'CERT_ALREADY_ACTIVE',
          409,
        )
      }
    }

    if (!skipWildcardCheck) {
      const potentialWildcard = getPotentialWildcard(certName)
      if (potentialWildcard) {
        const covering = await CertificateModel.exists({
          certName:       potentialWildcard,
          organizationId: orgId,
          status:         { $in: ['active', 'renewing'] },
          expiryDate:     { $gt: new Date() },
        })
        if (covering) {
          return ApiResponse.error(
            c,
            `Active wildcard (${potentialWildcard}) covers this domain. Use adopt-wildcard to reuse it instantly, or choose "Dedicated Cert" to issue independently.`,
            'WILDCARD_COVERS_CERT',
            409,
          )
        }
      }
    }

    try {
      const result = await acmeService.initiateOrder(certName, orgId, email)
      return ApiResponse.success(c, result, 'Order initiated. Complete any one of the listed challenges, then verify.')
    } catch (error: unknown) {
      return ApiResponse.error(c, errMsg(error), 'INITIATE_ERROR', 500)
    }
  },
)

// ── Verify challenge ──────────────────────────────────────────────────────────

const VERIFY_TTL_MS = 5 * 60 * 1000

/**
 * POST /api/ssl/verify
 * Tells Let's Encrypt to validate the stored challenge.
 * Cert must be in `pending_challenge` state.
 * On success transitions to `challenge_verified`.
 */
export const verifyChallengeHandler = factory.createHandlers(
  zValidator('json', verifySchema),
  async (c) => {
    const { certName, challengeType } = c.req.valid('json')
    const orgId = c.get('organizationId')
    const email = c.get('userEmail')

    try {
      const certDoc = await CertificateModel.findOne(
        { certName, organizationId: orgId },
        { _id: 1, status: 1, lastChecked: 1 },
      ).lean()

      if (!certDoc) return ApiResponse.error(c, 'Certificate not found.', 'NOT_FOUND', 404)
      if (certDoc.status !== 'pending_challenge') {
        return ApiResponse.error(
          c,
          `Certificate is not awaiting verification (status: ${certDoc.status}).`,
          'INVALID_STATE',
          409,
        )
      }

      if (certDoc.lastChecked) {
        const elapsed = Date.now() - certDoc.lastChecked.getTime()
        if (elapsed < VERIFY_TTL_MS) {
          const wait = Math.ceil((VERIFY_TTL_MS - elapsed) / 1000)
          return ApiResponse.error(c, `Please wait ${wait}s before retrying.`, 'TTL_BLOCK', 429)
        }
      }

      await CertificateModel.updateOne({ _id: certDoc._id }, { $set: { lastChecked: new Date() } })
      await acmeService.verifyChallenge(certName, orgId, email, challengeType)

      return ApiResponse.success(c, { status: 'challenge_verified' }, 'Challenge verified. Generate the certificate.')
    } catch (error: unknown) {
      return ApiResponse.error(c, errMsg(error), 'VERIFY_ERROR', 500)
    }
  },
)

// ── Generate certificate ──────────────────────────────────────────────────────

/**
 * POST /api/ssl/generate
 * Finalises the ACME order and issues the certificate.
 * Cert must be in `challenge_verified` state.
 */
export const generateCertHandler = factory.createHandlers(
  zValidator('json', certNameSchema),
  async (c) => {
    const { certName } = c.req.valid('json')
    const orgId = c.get('organizationId')
    const email = c.get('userEmail')

    try {
      const certDoc = await CertificateModel.findOne(
        { certName, organizationId: orgId },
        { status: 1 },
      ).lean()

      if (!certDoc) return ApiResponse.error(c, 'Certificate not found.', 'NOT_FOUND', 404)
      if (certDoc.status !== 'challenge_verified') {
        return ApiResponse.error(
          c,
          `Challenge not verified yet (status: ${certDoc.status}).`,
          'INVALID_STATE',
          409,
        )
      }

      const result = await acmeService.generateCertificate(certName, orgId, email)
      return ApiResponse.success(c, result, 'Certificate issued successfully.')
    } catch (error: unknown) {
      return ApiResponse.error(c, errMsg(error), 'GENERATE_ERROR', 500)
    }
  },
)

// ── List domains with their certificates ──────────────────────────────────────

/**
 * GET /api/ssl/domains
 * Returns all root domains for the org, each with its associated certificates.
 */
export const listDomainsHandler = factory.createHandlers(async (c) => {
  const orgId = c.get('organizationId')

  try {
    const [domains, certs] = await Promise.all([
      DomainModel.find({ organizationId: orgId })
        .sort({ name: 1 })
        .lean(),
      CertificateModel.find({ organizationId: orgId })
        .select('-certPem -keyPem')
        .sort({ certName: 1 })
        .lean(),
    ])

    const certsByDomainId = new Map<string, typeof certs>()
    for (const cert of certs) {
      const key = cert.domainId.toString()
      if (!certsByDomainId.has(key)) certsByDomainId.set(key, [])
      certsByDomainId.get(key)!.push(cert)
    }

    const result = domains.map((d) => ({
      ...d,
      certs: certsByDomainId.get(d._id.toString()) ?? [],
    }))

    return ApiResponse.success(c, { domains: result }, 'Domains fetched.')
  } catch (error: unknown) {
    return ApiResponse.error(c, errMsg(error), 'LIST_ERROR', 500)
  }
})

// ── Certificate detail ────────────────────────────────────────────────────────

/**
 * GET /api/ssl/certs/:id
 * Returns the full certificate document including PEM.
 */
export const getCertHandler = factory.createHandlers(async (c) => {
  const id    = c.req.param('id')
  const orgId = c.get('organizationId')

  if (!isValidObjectId(id)) return badId(c, 'certificate')

  try {
    const cert = await CertificateModel.findOne({ _id: id, organizationId: orgId }).lean()
    if (!cert) return ApiResponse.error(c, 'Certificate not found.', 'NOT_FOUND', 404)
    return ApiResponse.success(c, cert, 'Certificate fetched.')
  } catch (error: unknown) {
    return ApiResponse.error(c, errMsg(error), 'FETCH_ERROR', 500)
  }
})

// ── Delete certificate ────────────────────────────────────────────────────────

/**
 * DELETE /api/ssl/certs/:id
 * Deletes a single certificate.
 * If it was the last cert under its domain, the domain record is also removed.
 */
export const deleteCertHandler = factory.createHandlers(async (c) => {
  const id    = c.req.param('id')
  const orgId = c.get('organizationId')

  if (!isValidObjectId(id)) return badId(c, 'certificate')

  try {
    const cert = await CertificateModel.findOneAndDelete({ _id: id, organizationId: orgId })
    if (!cert) return ApiResponse.error(c, 'Certificate not found.', 'NOT_FOUND', 404)

    // Clean up the root Domain record if no certs remain
    const remaining = await CertificateModel.countDocuments({ domainId: cert.domainId })
    if (remaining === 0) {
      await DomainModel.deleteOne({ _id: cert.domainId })
    }

    return ApiResponse.success(c, null, 'Certificate deleted.')
  } catch (error: unknown) {
    return ApiResponse.error(c, errMsg(error), 'DELETE_ERROR', 500)
  }
})

// ── Delete root domain ────────────────────────────────────────────────────────

/**
 * DELETE /api/ssl/domains/:id
 * Deletes a root domain and all its certificates.
 */
export const deleteDomainHandler = factory.createHandlers(async (c) => {
  const id    = c.req.param('id')
  const orgId = c.get('organizationId')

  if (!isValidObjectId(id)) return badId(c, 'domain')

  try {
    const domain = await DomainModel.findOneAndDelete({ _id: id, organizationId: orgId })
    if (!domain) return ApiResponse.error(c, 'Domain not found.', 'NOT_FOUND', 404)

    await CertificateModel.deleteMany({ domainId: id, organizationId: orgId })

    return ApiResponse.success(c, null, 'Domain and all certificates deleted.')
  } catch (error: unknown) {
    return ApiResponse.error(c, errMsg(error), 'DELETE_ERROR', 500)
  }
})
