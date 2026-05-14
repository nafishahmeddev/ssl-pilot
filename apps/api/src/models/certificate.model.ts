import { Schema, model, Document, Types } from 'mongoose'

export type CertStatus = 'pending' | 'pending_challenge' | 'challenge_verified' | 'active' | 'renewing' | 'expired' | 'failed'

export const ChallengeType = {
  DNS_01:  'dns-01',
  HTTP_01: 'http-01',
} as const
export type ChallengeType = (typeof ChallengeType)[keyof typeof ChallengeType]

export const CertType = {
  WILDCARD: 'wildcard', // *.idexa.app
  SINGLE:   'single',   // api.idexa.app
  APEX:     'apex',     // idexa.app
} as const
export type CertType = (typeof CertType)[keyof typeof CertType]

/**
 * Represents a single SSL certificate (or an in-progress ACME order) issued
 * under a root Domain.
 *
 * Status transitions:
 *   pending → pending_challenge → challenge_verified → active → renewing → pending_challenge → challenge_verified → active
 *   pending_challenge → failed
 *
 * coveredByWildcardId is set when the cert was activated by adopting an existing
 * wildcard certificate instead of running a new ACME order.
 */
export interface ICertificate extends Document {
  _id: Types.ObjectId
  domainId: Types.ObjectId
  organizationId: Types.ObjectId
  /** The specific domain this cert covers — e.g. '*.idexa.app', 'api.idexa.app'. */
  certName: string
  certType: CertType
  status: CertStatus
  challengeType?: ChallengeType
  /** Ref to the wildcard Certificate that covers this cert (adopt-wildcard flow). */
  coveredByWildcardId?: Types.ObjectId
  // ── ACME order fields (cleared after issuance) ──────────────────────────────
  acmeOrderUrl?: string
  acmeChallengeUrl?: string
  // ── DNS-01 ──────────────────────────────────────────────────────────────────
  txtRecordName?: string
  txtRecordValue?: string
  // ── HTTP-01 ─────────────────────────────────────────────────────────────────
  httpChallengeToken?: string
  httpChallengeKeyAuth?: string
  // ── Issued certificate ───────────────────────────────────────────────────────
  certPem?: string
  keyPem?: string
  expiryDate?: Date
  issuedAt?: Date
  // ── Renewal ─────────────────────────────────────────────────────────────────
  renewalError?: string
  renewalFailedAt?: Date
  renewalRetryCount?: number
  renewalNextRetryAt?: Date
  lastChecked?: Date
  createdAt: Date
  updatedAt: Date
}

const certificateSchema = new Schema<ICertificate>(
  {
    domainId:            { type: Schema.Types.ObjectId, ref: 'Domain',       required: true, index: true },
    organizationId:      { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    certName:            { type: String, required: true, trim: true, lowercase: true },
    certType:            { type: String, enum: Object.values(CertType), required: true },
    status: {
      type: String,
      enum: ['pending', 'pending_challenge', 'challenge_verified', 'active', 'renewing', 'expired', 'failed'],
      default: 'pending',
    },
    challengeType:       { type: String, enum: Object.values(ChallengeType) },
    coveredByWildcardId: { type: Schema.Types.ObjectId, ref: 'Certificate' },
    acmeOrderUrl:        { type: String },
    acmeChallengeUrl:    { type: String },
    txtRecordName:       { type: String },
    txtRecordValue:      { type: String },
    httpChallengeToken:  { type: String },
    httpChallengeKeyAuth:{ type: String },
    certPem:             { type: String },
    keyPem:              { type: String },
    expiryDate:          { type: Date, index: true },
    issuedAt:            { type: Date },
    renewalError:        { type: String, maxlength: 2000 },
    renewalFailedAt:     { type: Date },
    renewalRetryCount:   { type: Number, default: 0 },
    renewalNextRetryAt:  { type: Date },
    lastChecked:         { type: Date },
  },
  { timestamps: true },
)

// Compound indexes
certificateSchema.index({ organizationId: 1, certName: 1 }, { unique: true }) // unique per org
certificateSchema.index({ organizationId: 1, status: 1, expiryDate: 1 })      // renewal job
certificateSchema.index({ domainId: 1, certName: 1 })                         // per-domain lookup

/** Derives cert type from its name. */
export function inferCertType(certName: string): CertType {
  if (certName.startsWith('*.')) return CertType.WILDCARD
  const parts = certName.split('.')
  return parts.length === 2 ? CertType.APEX : CertType.SINGLE
}

export const CertificateModel = model<ICertificate>('Certificate', certificateSchema)
