import type { ApiResponse } from './api'

export interface ChallengeInfo {
  txtName: string
  txtValue: string
}

export interface IssuedCertificate {
  cert: string
  key: string
}

export type InitiateSslResponse = ApiResponse<ChallengeInfo>
export type VerifySslResponse = ApiResponse<IssuedCertificate>
