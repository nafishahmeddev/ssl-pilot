import { Schema, model, Document, Types } from 'mongoose'

export type DomainStatus = 'pending' | 'pending_challenge' | 'active' | 'expired' | 'failed'

/** ACME challenge methods supported by this service. */
export const ChallengeType = {
  DNS_01:  'dns-01',
  HTTP_01: 'http-01',
} as const

export type ChallengeType = (typeof ChallengeType)[keyof typeof ChallengeType]

/** Whether the certificate covers a wildcard (`*.example.com`) or a single FQDN. */
export const DomainType = {
  WILDCARD: 'wildcard',
  SINGLE:   'single',
} as const

export type DomainType = (typeof DomainType)[keyof typeof DomainType]

/**
 * Represents a managed domain and its SSL certificate lifecycle.
 *
 * Status transitions (cron-driven paths in brackets):
 *   pending → pending_challenge → active → [expired] → pending_challenge → …
 *   pending_challenge → failed  (ACME verification failed)
 *
 * `renewalError` / `renewalFailedAt` are set by the renewal cron when it cannot
 * initiate a new ACME order automatically. Once set, only a manual user action
 * (from the admin panel) can clear them and re-queue the renewal.
 */
export interface IDomain extends Document {
  _id: Types.ObjectId
  organizationId: Types.ObjectId
  domainName: string
  status: DomainStatus
  /** Whether this is a wildcard or single-domain certificate. */
  domainType: DomainType
  /** Challenge method used for the active or last ACME order. */
  challengeType?: ChallengeType
  acmeOrderUrl?: string
  acmeChallengeUrl?: string
  // ── DNS-01 fields ──────────────────────────────────────────────────────────
  txtRecordName?: string
  txtRecordValue?: string
  // ── HTTP-01 fields ─────────────────────────────────────────────────────────
  /** ACME challenge token; serve at /.well-known/acme-challenge/<token>. */
  httpChallengeToken?: string
  /** File content to serve at the challenge URL (keyAuthorization string). */
  httpChallengeKeyAuth?: string
  // ──────────────────────────────────────────────────────────────────────────
  /** PEM-encoded certificate from the last successful issuance. */
  certPem?: string
  /** PEM-encoded private key from the last successful issuance. */
  keyPem?: string
  /** Error message from the last failed auto-renewal attempt (cron). */
  renewalError?: string
  /** Timestamp of the last failed auto-renewal attempt. */
  renewalFailedAt?: Date
  lastChecked?: Date
  expiryDate?: Date
  createdAt: Date
  updatedAt: Date
}

const domainSchema = new Schema<IDomain>(
  {
    organizationId: { type: Schema.Types.ObjectId, required: true, index: true },
    domainName: { type: String, required: true, unique: true, trim: true, lowercase: true },
    status: {
      type: String,
      enum: ['pending', 'pending_challenge', 'active', 'expired', 'failed'],
      default: 'pending',
    },
    domainType:    { type: String, enum: Object.values(DomainType), required: true, default: DomainType.SINGLE },
    challengeType: { type: String, enum: Object.values(ChallengeType) },
    acmeOrderUrl: { type: String },
    acmeChallengeUrl: { type: String },
    txtRecordName: { type: String },
    txtRecordValue: { type: String },
    httpChallengeToken: { type: String },
    httpChallengeKeyAuth: { type: String },
    certPem: { type: String },
    keyPem: { type: String },
    renewalError: { type: String, maxlength: 2000 },
    renewalFailedAt: { type: Date },
    lastChecked: { type: Date },
    expiryDate: { type: Date },
  },
  { timestamps: true }
)

export const DomainModel = model<IDomain>('Domain', domainSchema)
