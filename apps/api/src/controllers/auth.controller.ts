import { createFactory } from 'hono/factory'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { UserModel } from '@src/models/user.model'
import { OrganizationModel } from '@src/models/organization.model'
import type { IOrganization } from '@src/models/organization.model'
import { ApiResponse } from '@src/shared/utils/response'
import { sign, verify } from 'hono/jwt'
import { setCookie, getCookie, deleteCookie } from 'hono/cookie'
import { env } from '@src/shared/config/env'
import type { Env } from '@src/app'

const factory = createFactory<Env>()

/** Shared access-token payload — keeps loginHandler and refreshHandler in sync. */
function createAccessToken(user: { _id: { toString(): string }; organizationId: { toString(): string }; role: string; email: string }) {
  return sign(
    {
      sub:            user._id.toString(),
      organizationId: user.organizationId.toString(),
      role:           user.role,
      email:          user.email,
      exp:            Math.floor(Date.now() / 1000) + 60 * 15, // 15 min
    },
    env.JWT_ACCESS_SECRET,
  )
}

const registerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  organizationName: z.string().min(2, 'Organization name must be at least 2 characters'),
})

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
})

export const registerHandler = factory.createHandlers(
  zValidator('json', registerSchema),
  async (c) => {
    const { name, email, password, organizationName } = c.req.valid('json')

    try {
      const existingUser = await UserModel.findOne({ email })
      if (existingUser) {
        return ApiResponse.error(c, 'User with this email already exists', 'EMAIL_EXISTS', 400)
      }

      const slug = organizationName.toLowerCase().replace(/\s+/g, '-')
      const org = await OrganizationModel.create({ name: organizationName, slug })

      const user = new UserModel({ name, email, password, organizationId: org._id, role: 'admin' })
      await user.save()

      return ApiResponse.success(c, { userId: user._id, organizationId: org._id }, 'Registration successful', 201)
    } catch (error: unknown) {
      return ApiResponse.error(c, (error as Error).message, 'REGISTER_ERROR', 500)
    }
  }
)

export const loginHandler = factory.createHandlers(
  zValidator('json', loginSchema),
  async (c) => {
    const { email, password } = c.req.valid('json')

    try {
      const user = await UserModel.findOne({ email })
      if (!user || !(await user.comparePassword(password))) {
        return ApiResponse.error(c, 'Invalid credentials', 'INVALID_CREDENTIALS', 401)
      }

      const accessToken = await createAccessToken(user)

      const now = Math.floor(Date.now() / 1000)
      const refreshToken = await sign(
        { sub: user._id.toString(), exp: now + 60 * 60 * 24 * 7 },
        env.JWT_REFRESH_SECRET
      )

      setCookie(c, 'refreshToken', refreshToken, {
        httpOnly: true,
        secure: env.NODE_ENV === 'production',
        sameSite: 'Strict',
        maxAge: 60 * 60 * 24 * 7,
      })

      return ApiResponse.success(c, { accessToken }, 'Login successful')
    } catch (error: unknown) {
      return ApiResponse.error(c, (error as Error).message, 'LOGIN_ERROR', 500)
    }
  }
)

export const refreshHandler = factory.createHandlers(async (c) => {
  const refreshToken = getCookie(c, 'refreshToken')

  if (!refreshToken) {
    return ApiResponse.error(c, 'No refresh token provided', 'NO_REFRESH_TOKEN', 401)
  }

  try {
    const payload = await verify(refreshToken, env.JWT_REFRESH_SECRET, 'HS256')

    const user = await UserModel.findById(payload.sub)
    if (!user) {
      return ApiResponse.error(c, 'User not found', 'USER_NOT_FOUND', 401)
    }

    const accessToken = await createAccessToken(user)

    return ApiResponse.success(c, { accessToken }, 'Token refreshed successfully')
  } catch {
    return ApiResponse.error(c, 'Invalid or expired refresh token', 'INVALID_REFRESH_TOKEN', 401)
  }
})

export const logoutHandler = factory.createHandlers(async (c) => {
  deleteCookie(c, 'refreshToken')
  return ApiResponse.success(c, null, 'Logged out successfully')
})

export const meHandler = factory.createHandlers(async (c) => {
  const userId = c.get('userId')

  try {
    const user = await UserModel.findById(userId)
      .populate<{ organizationId: IOrganization }>('organizationId')
      .lean()
    if (!user) {
      return ApiResponse.error(c, 'User not found', 'USER_NOT_FOUND', 404)
    }

    return ApiResponse.success(c, {
      name: user.name,
      email: user.email,
      company: user.organizationId?.name ?? 'No Company',
      role: user.role,
    }, 'User profile fetched.')
  } catch (error: unknown) {
    return ApiResponse.error(c, (error as Error).message, 'FETCH_PROFILE_ERROR', 500)
  }
})

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(6, 'New password must be at least 6 characters'),
})

export const changePasswordHandler = factory.createHandlers(
  zValidator('json', changePasswordSchema),
  async (c) => {
    const userId = c.get('userId')
    const { currentPassword, newPassword } = c.req.valid('json')

    try {
      const user = await UserModel.findById(userId)
      if (!user) {
        return ApiResponse.error(c, 'User not found', 'USER_NOT_FOUND', 404)
      }

      if (!(await user.comparePassword(currentPassword))) {
        return ApiResponse.error(c, 'Invalid current password', 'INVALID_PASSWORD', 400)
      }

      user.password = newPassword
      await user.save()

      return ApiResponse.success(c, null, 'Password changed successfully.')
    } catch (error: unknown) {
      return ApiResponse.error(c, (error as Error).message, 'CHANGE_PASSWORD_ERROR', 500)
    }
  }
)
