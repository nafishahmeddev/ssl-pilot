import type { Context } from 'hono'
import type { StatusCode } from 'hono/utils/http-status'
import type { Env } from '@src/app'

export type ErrorDetail = {
  code: string
  message: string
  target?: string // Optional field name where the error occurred
}

export type SuccessResponse<T> = {
  data: T
  meta: {
    message?: string
    requestId: string
    timestamp: string
    apiVersion: string
  }
}

export type ErrorResponse = {
  errors: ErrorDetail[]
  meta: {
    requestId: string
    timestamp: string
    apiVersion: string
  }
}

const API_VERSION = 'v1'

/**
 * Standardized API Response structure following industry best practices (Envelope Pattern).
 */
export const ApiResponse = {
  /**
   * Success response wrapper.
   */
  success: <T>(c: Context<Env>, data: T, message?: string, status: StatusCode = 200) => {
    const requestId = c.get('requestId')
    c.status(status)
    return c.json<SuccessResponse<T>>({
      data,
      meta: {
        message,
        requestId,
        timestamp: new Date().toISOString(),
        apiVersion: API_VERSION
      }
    })
  },
  
  /**
   * Single error response wrapper.
   */
  error: (c: Context<Env>, message: string, code: string = 'INTERNAL_ERROR', status: StatusCode = 500, target?: string) => {
    const requestId = c.get('requestId')
    c.status(status)
    return c.json<ErrorResponse>({
      errors: [
        {
          code,
          message,
          target
        }
      ],
      meta: {
        requestId,
        timestamp: new Date().toISOString(),
        apiVersion: API_VERSION
      }
    })
  },
  
  /**
   * Validation error response wrapper (supports multiple errors).
   */
  validationError: (c: Context<Env>, errors: ErrorDetail[]) => {
    const requestId = c.get('requestId')
    c.status(400)
    return c.json<ErrorResponse>({
      errors,
      meta: {
        requestId,
        timestamp: new Date().toISOString(),
        apiVersion: API_VERSION
      }
    })
  }
}
