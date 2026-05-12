import type { ApiResponse } from './api'

export interface ChallengeInfo {
  txtName: string
  txtValue: string
}

export interface IssuedCertificate {
  cert: string
  key: string
}

export interface DomainRecord {
  _id: string
  domainName: string
  status: 'pending' | 'pending_challenge' | 'active' | 'expired' | 'failed'
  txtRecordName?: string
  txtRecordValue?: string
  expiryDate?: string
  createdAt: string
  updatedAt: string
}

export type InitiateSslResponse = ApiResponse<ChallengeInfo>
export type VerifySslResponse = ApiResponse<IssuedCertificate>
export type CertificatesResponse = ApiResponse<{ certificates: DomainRecord[] }>
