export interface ApiMeta {
  message?: string
  requestId: string
  timestamp: string
  apiVersion: string
}

export interface ApiResponse<T> {
  data: T
  meta: ApiMeta
}

export interface ApiErrorResponse {
  errors: Array<{
    code: string
    message: string
    target?: string
  }>
  meta: ApiMeta
}
