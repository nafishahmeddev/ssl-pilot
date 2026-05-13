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
    if (!sub || !organizationId || !role || !email) {
      return ApiResponse.error(c, 'Malformed token payload', 'INVALID_TOKEN', 401)
    }

    c.set('userId', sub as string)
    c.set('organizationId', organizationId as string)
    c.set('userRole', role as string)
    c.set('userEmail', email as string)

    await next()
  } catch {
    return ApiResponse.error(c, 'Invalid or expired token', 'INVALID_TOKEN', 401)
  }
})
