import { Schema, model, Document, Types } from 'mongoose'

/**
 * Returns the registrable domain (last two DNS labels).
 * Used to group certificates under their root domain.
 *
 * '*.api.idexa.app' → 'idexa.app'
 * 'api.idexa.app'   → 'idexa.app'
 * 'idexa.app'       → 'idexa.app'
 */
export function extractRootDomain(certName: string): string {
  const d = certName.startsWith('*.') ? certName.slice(2) : certName
  const parts = d.split('.')
  return parts.slice(-2).join('.')
}

/**
 * Returns the immediate wildcard that would cover this cert name, or null.
 *
 * 'api.idexa.app'     → '*.idexa.app'
 * 'sub.api.idexa.app' → '*.api.idexa.app'   (not '*.idexa.app' — two levels deep)
 * 'idexa.app'         → null  (apex cannot be covered by a wildcard)
 * '*.idexa.app'       → null  (wildcards cannot be covered by wildcards)
 */
export function getPotentialWildcard(certName: string): string | null {
  if (certName.startsWith('*.')) return null
  const parts = certName.split('.')
  if (parts.length < 3) return null          // apex — e.g. 'idexa.app'
  return `*.${parts.slice(1).join('.')}`     // 'api.idexa.app' → '*.idexa.app'
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Represents the root/registrable domain that an organisation has added.
 * Acts as the grouping container for all certificates issued under it.
 *
 * 'idexa.app' is the Domain; '*.idexa.app' and 'api.idexa.app' are Certificates.
 */
export interface IDomain extends Document {
  _id: Types.ObjectId
  organizationId: Types.ObjectId
  /** Registrable domain — last two DNS labels, e.g. 'idexa.app'. Globally unique. */
  name: string
  createdAt: Date
  updatedAt: Date
}

const domainSchema = new Schema<IDomain>(
  {
    organizationId: { type: Schema.Types.ObjectId, required: true, index: true },
    name:           { type: String, required: true, trim: true, lowercase: true },
  },
  { timestamps: true },
)

domainSchema.index({ organizationId: 1, name: 1 }, { unique: true })

export const DomainModel = model<IDomain>('Domain', domainSchema)
