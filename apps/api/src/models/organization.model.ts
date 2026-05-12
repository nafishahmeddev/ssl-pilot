import { Schema, model } from 'mongoose'

/**
 * Mongoose Schema for Organizations (Multi-tenancy).
 * Each organization can have multiple users and domains.
 */
const organizationSchema = new Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  slug: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  }
}, {
  timestamps: true
})

export const OrganizationModel = model('Organization', organizationSchema)
