import type { ApiResponse } from './api'

// ── Enums ──────────────────────────────────────────────────────────────────────

export type CertStatus = 'pending' | 'pending_challenge' | 'challenge_verified' | 'active' | 'renewing' | 'expired' | 'failed'

export const ChallengeType = {
  DNS_01:  'dns-01',
  HTTP_01: 'http-01',
} as const
export type ChallengeType = (typeof ChallengeType)[keyof typeof ChallengeType]

export const CertType = {
  WILDCARD: 'wildcard',
  SINGLE:   'single',
  APEX:     'apex',
} as const
export type CertType = (typeof CertType)[keyof typeof CertType]

// ── Domain (root/registrable) ──────────────────────────────────────────────────

/** Root domain record — the grouping container (e.g. 'idexa.app'). */
export interface DomainRecord {
  _id: string
  organizationId: string
  name: string          // e.g. 'idexa.app'
  createdAt: string
  updatedAt: string
}

/** Domain with all its certificate records (returned by list endpoint). */
export interface DomainWithCerts extends DomainRecord {
  certs: CertRecord[]
}

// ── Certificate ────────────────────────────────────────────────────────────────

/** Certificate record without PEM (used in list views). */
export interface CertRecord {
  _id: string
  domainId: string
  organizationId: string
  /** The specific domain this cert covers — e.g. '*.idexa.app', 'api.idexa.app'. */
  certName: string
  certType: CertType
  status: CertStatus
  challengeType?: ChallengeType
  /** Set when cert was adopted from a wildcard (no ACME order). */
  coveredByWildcardId?: string
  txtRecordName?: string
  txtRecordValue?: string
  httpChallengeToken?: string
  httpChallengeKeyAuth?: string
  renewalError?: string
  renewalRetryCount?: number
  renewalNextRetryAt?: string
  expiryDate?: string
  issuedAt?: string
  createdAt: string
  updatedAt: string
}

/** Full certificate with PEM — returned by the detail endpoint. */
export interface CertDetail extends CertRecord {
  certPem?: string
  keyPem?: string
}

// ── Challenge info (returned from initiate) ────────────────────────────────────

export type DnsChallengeInfo = {
  challengeType: typeof ChallengeType.DNS_01
  txtName: string
  txtValue: string
}

export type HttpChallengeInfo = {
  challengeType: typeof ChallengeType.HTTP_01
  token: string
  keyAuth: string
}

export type ChallengeInfo = DnsChallengeInfo | HttpChallengeInfo

// ── Issued certificate (returned from generate / adopt-wildcard) ───────────────

export interface IssuedCertificate {
  cert: string
  key: string
}

// ── Wildcard coverage (returned from wildcard-check) ──────────────────────────

export interface WildcardInfo {
  id: string
  certName: string
  expiryDate?: string
}

export interface WildcardCheckData {
  covered: boolean
  wildcard?: WildcardInfo
}

// ── API response aliases ───────────────────────────────────────────────────────

export type DomainsResponse       = ApiResponse<{ domains: DomainWithCerts[] }>
export type CertDetailResponse    = ApiResponse<CertDetail>
export type InitiateSslResponse   = ApiResponse<{ challenges: ChallengeInfo[] }>
export type VerifySslResponse     = ApiResponse<{ status: 'challenge_verified' }>
export type GenerateSslResponse   = ApiResponse<IssuedCertificate>
export type AdoptWildcardResponse  = ApiResponse<IssuedCertificate>
export type WildcardCheckResponse  = ApiResponse<WildcardCheckData>
