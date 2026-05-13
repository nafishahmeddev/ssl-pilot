import { createMiddleware } from 'hono/factory'
import { ApiKeyModel, hashApiKey } from '@src/models/apikey.model'
import { ApiResponse } from '@src/shared/utils/response'

export const apiKeyMiddleware = createMiddleware(async (c, next) => {
  const authHeader = c.req.header('Authorization')

  if (!authHeader?.startsWith('Bearer ')) {
    return ApiResponse.error(c, 'API key required', 'UNAUTHORIZED', 401)
  }

  const key = authHeader.split(' ')[1]!
  const keyHash = hashApiKey(key)

  const apiKey = await ApiKeyModel.findOneAndUpdate(
    { keyHash },
    { $set: { lastUsedAt: new Date() } },
    { new: true, select: 'organizationId' },
  ).lean()

  if (!apiKey) {
    return ApiResponse.error(c, 'Invalid API key', 'UNAUTHORIZED', 401)
  }

  c.set('organizationId', apiKey.organizationId.toString())
  await next()
})
