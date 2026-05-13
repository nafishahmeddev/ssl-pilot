import type { ApiResponse } from './api'

export type DomainStatus = 'pending' | 'pending_challenge' | 'challenge_verified' | 'active' | 'expired' | 'failed'

// ── Challenge types ────────────────────────────────────────────────────────────

export const ChallengeType = {
  DNS_01:  'dns-01',
  HTTP_01: 'http-01',
} as const

export type ChallengeType = (typeof ChallengeType)[keyof typeof ChallengeType]

export const DomainType = {
  WILDCARD: 'wildcard',
  SINGLE:   'single',
} as const

export type DomainType = (typeof DomainType)[keyof typeof DomainType]

export type DnsChallengeInfo = {
  challengeType: typeof ChallengeType.DNS_01
  txtName: string
  txtValue: string
}

export type HttpChallengeInfo = {
  challengeType: typeof ChallengeType.HTTP_01
  /** ACME challenge token — path segment in the well-known URL. */
  token: string
  /** Exact content to serve at the challenge URL. */
  keyAuth: string
}

/** Discriminated union — narrow on `challengeType` to access type-specific fields. */
export type ChallengeInfo = DnsChallengeInfo | HttpChallengeInfo

// ── Issued certificate ─────────────────────────────────────────────────────────

export interface IssuedCertificate {
  cert: string
  key: string
}

// ── Domain records ─────────────────────────────────────────────────────────────

/** Lightweight record returned by the list endpoint. */
export interface DomainRecord {
  _id: string
  domainName: string
  status: DomainStatus
  domainType: DomainType
  challengeType?: ChallengeType
  txtRecordName?: string
  txtRecordValue?: string
  httpChallengeToken?: string
  httpChallengeKeyAuth?: string
  /** Present when the cron failed to auto-renew; user must trigger manually. */
  renewalError?: string
  expiryDate?: string
  createdAt: string
  updatedAt: string
}

/** Full document returned by the single-domain detail endpoint. */
export interface DomainDetail {
  _id: string
  organizationId: string
  domainName: string
  status: DomainStatus
  domainType: DomainType
  challengeType?: ChallengeType
  acmeOrderUrl?: string
  acmeChallengeUrl?: string
  txtRecordName?: string
  txtRecordValue?: string
  httpChallengeToken?: string
  httpChallengeKeyAuth?: string
  /** PEM-encoded certificate from last successful issuance. */
  certPem?: string
  /** PEM-encoded private key from last successful issuance. */
  keyPem?: string
  /** Error from last failed auto-renewal (cron). Cleared on successful manual initiate. */
  renewalError?: string
  renewalFailedAt?: string
  expiryDate?: string
  lastChecked?: string
  createdAt: string
  updatedAt: string
}

// ── API response aliases ───────────────────────────────────────────────────────

export type InitiateSslResponse   = ApiResponse<ChallengeInfo>
export type VerifySslResponse     = ApiResponse<{ status: 'challenge_verified' }>
export type GenerateSslResponse   = ApiResponse<IssuedCertificate>
export type CertificatesResponse  = ApiResponse<{ certificates: DomainRecord[] }>
export type DomainDetailResponse  = ApiResponse<DomainDetail>
