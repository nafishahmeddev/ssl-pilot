import { Schema, model, Document, Types } from 'mongoose'

export type DomainStatus = 'pending' | 'pending_challenge' | 'active' | 'expired' | 'failed'

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
  acmeOrderUrl?: string
  acmeChallengeUrl?: string
  txtRecordName?: string
  txtRecordValue?: string
  /** PEM-encoded certificate from the last successful issuance. */
  certPem?: string
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
    acmeOrderUrl: { type: String },
    acmeChallengeUrl: { type: String },
    txtRecordName: { type: String },
    txtRecordValue: { type: String },
    certPem: { type: String },
    renewalError: { type: String },
    renewalFailedAt: { type: Date },
    lastChecked: { type: Date },
    expiryDate: { type: Date },
  },
  { timestamps: true }
)

export const DomainModel = model<IDomain>('Domain', domainSchema)
