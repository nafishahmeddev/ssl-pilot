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

    c.set('userId', payload.sub as string)
    c.set('organizationId', payload.organizationId as string)
    c.set('userRole', payload.role as string)
    c.set('userEmail', payload.email as string)

    await next()
  } catch {
    return ApiResponse.error(c, 'Invalid or expired token', 'INVALID_TOKEN', 401)
  }
})
