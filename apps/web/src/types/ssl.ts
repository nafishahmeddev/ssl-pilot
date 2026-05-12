import type { ApiResponse } from './api'

export type DomainStatus = 'pending' | 'pending_challenge' | 'active' | 'expired' | 'failed'

export interface ChallengeInfo {
  txtName: string
  txtValue: string
}

export interface IssuedCertificate {
  cert: string
  key: string
}

/** Lightweight record returned by the list endpoint. */
export interface DomainRecord {
  _id: string
  domainName: string
  status: DomainStatus
  txtRecordName?: string
  txtRecordValue?: string
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
  acmeOrderUrl?: string
  acmeChallengeUrl?: string
  txtRecordName?: string
  txtRecordValue?: string
  /** PEM-encoded certificate from last successful issuance. */
  certPem?: string
  /** Error from last failed auto-renewal (cron). Cleared on successful manual initiate. */
  renewalError?: string
  renewalFailedAt?: string
  expiryDate?: string
  lastChecked?: string
  createdAt: string
  updatedAt: string
}

export type InitiateSslResponse = ApiResponse<ChallengeInfo>
export type VerifySslResponse = ApiResponse<IssuedCertificate>
export type CertificatesResponse = ApiResponse<{ certificates: DomainRecord[] }>
export type DomainDetailResponse = ApiResponse<DomainDetail>
