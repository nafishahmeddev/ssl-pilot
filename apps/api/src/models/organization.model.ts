import { Schema, model, Document, Types } from 'mongoose'

export interface IOrganization extends Document {
  _id: Types.ObjectId
  name: string
  slug: string
  acmeAccountKey?: string
  createdAt: Date
  updatedAt: Date
}

const organizationSchema = new Schema<IOrganization>(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, trim: true, lowercase: true },
    acmeAccountKey: { type: String },
  },
  { timestamps: true }
)

export const OrganizationModel = model<IOrganization>('Organization', organizationSchema)
