import { Schema, model, Document, Types } from 'mongoose'
import { createHash, randomBytes } from 'crypto'

export interface IApiKey extends Document {
  _id: Types.ObjectId
  keyHash: string
  organizationId: Types.ObjectId
  name: string
  lastUsedAt?: Date
  createdAt: Date
  updatedAt: Date
}

const apiKeySchema = new Schema<IApiKey>(
  {
    keyHash:        { type: String, required: true, unique: true },
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    name:           { type: String, required: true, trim: true },
    lastUsedAt:     { type: Date },
  },
  { timestamps: true },
)

apiKeySchema.index({ organizationId: 1 })

export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex')
}

export function generateApiKey(): string {
  return `sslpilot_${randomBytes(32).toString('hex')}`
}

export const ApiKeyModel = model<IApiKey>('ApiKey', apiKeySchema)
