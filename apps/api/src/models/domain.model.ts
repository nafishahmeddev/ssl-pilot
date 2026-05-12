import { Schema, model } from 'mongoose'

/**
 * Mongoose Schema for storing domains to be monitored and managed.
 */
const domainSchema = new Schema({
  organizationId: {
    type: Schema.Types.ObjectId,
    required: true
  },
  domainName: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  status: {
    type: String,
    enum: ['pending', 'pending_challenge', 'active', 'expired', 'failed'],
    default: 'pending'
  },
  acmeOrderUrl: { type: String },
  acmeChallengeUrl: { type: String },
  txtRecordName: { type: String },
  txtRecordValue: { type: String },
  lastChecked: {
    type: Date
  },
  expiryDate: {
    type: Date
  }
}, {
  timestamps: true
})

export const DomainModel = model('Domain', domainSchema)
