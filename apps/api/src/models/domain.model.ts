import { Schema, model, Document, Types } from 'mongoose'

export type DomainStatus = 'pending' | 'pending_challenge' | 'active' | 'expired' | 'failed'

export interface IDomain extends Document {
  _id: Types.ObjectId
  organizationId: Types.ObjectId
  domainName: string
  status: DomainStatus
  acmeOrderUrl?: string
  acmeChallengeUrl?: string
  txtRecordName?: string
  txtRecordValue?: string
  certPem?: string
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
    lastChecked: { type: Date },
    expiryDate: { type: Date },
  },
  { timestamps: true }
)

export const DomainModel = model<IDomain>('Domain', domainSchema)
