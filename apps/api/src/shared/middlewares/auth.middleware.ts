import { createMiddleware } from 'hono/factory'
import { verify } from 'hono/jwt'
import { env } from '@src/shared/config/env'
import { ApiResponse } from '@src/shared/utils/response'

export const authMiddleware = createMiddleware(async (c, next) => {
  const authHeader = c.req.header('Authorization')

  if (!authHeader?.startsWith('Bearer ')) {
    return ApiResponse.error(c, 'No token provided', 'UNAUTHORIZED', 401)
  }

  const token = authHeader.split(' ')[1]

  try {
    const payload = await verify(token, env.JWT_ACCESS_SECRET, 'HS256')

    const { sub, organizationId, role, email } = payload
    if (
      typeof sub          !== 'string' ||
      typeof organizationId !== 'string' ||
      typeof role         !== 'string' ||
      typeof email        !== 'string'
    ) {
      return ApiResponse.error(c, 'Malformed token payload', 'INVALID_TOKEN', 401)
    }

    c.set('userId', sub)
    c.set('organizationId', organizationId)
    c.set('userRole', role)
    c.set('userEmail', email)

    await next()
  } catch {
    return ApiResponse.error(c, 'Invalid or expired token', 'INVALID_TOKEN', 401)
  }
})
