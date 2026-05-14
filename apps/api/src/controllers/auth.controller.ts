import { createFactory } from 'hono/factory'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { UserModel } from '@src/models/user.model'
import { OrganizationModel } from '@src/models/organization.model'
import type { IOrganization } from '@src/models/organization.model'
import { ApiResponse, errMsg } from '@src/shared/utils/response'
import { logger } from '@src/shared/utils/logger'
import { sign, verify } from 'hono/jwt'
import { setCookie, getCookie, deleteCookie } from 'hono/cookie'
import { env } from '@src/shared/config/env'
import type { Env } from '@src/app'

const factory = createFactory<Env>()

type TokenUser = { _id: { toString(): string }; organizationId: { toString(): string }; role: string; email: string }

/** Signs a 15-minute access JWT for the given user. */
function createAccessToken(user: TokenUser) {
  return sign(
    {
      sub:            user._id.toString(),
      organizationId: user.organizationId.toString(),
      role:           user.role,
      email:          user.email,
      exp:            Math.floor(Date.now() / 1000) + 60 * 15,
    },
    env.JWT_ACCESS_SECRET,
  )
}

/** Signs a 7-day refresh JWT for the given user. */
function createRefreshToken(user: { _id: { toString(): string } }) {
  return sign(
    { sub: user._id.toString(), exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7 },
    env.JWT_REFRESH_SECRET,
  )
}

/** Sets an httpOnly refresh-token cookie (7 days, Strict). */
function setRefreshCookie(c: Parameters<typeof setCookie>[0], token: string) {
  setCookie(c, 'refreshToken', token, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'Strict',
    maxAge: 60 * 60 * 24 * 7,
  })
}

const registerSchema = z.object({
  name:             z.string().min(2, 'Name must be at least 2 characters'),
  email:            z.string().email('Invalid email address'),
  password:         z.string().min(6, 'Password must be at least 6 characters'),
  organizationName: z.string().min(2, 'Organization name must be at least 2 characters'),
})

const loginSchema = z.object({
  email:    z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
})

// ── Register ──────────────────────────────────────────────────────────────────

/**
 * POST /api/auth/register
 * Creates a new organisation + admin user, then issues access + refresh tokens.
 * Returns the access token in the body; refresh token is set as an httpOnly cookie.
 */
export const registerHandler = factory.createHandlers(
  zValidator('json', registerSchema),
  async (c) => {
    const { name, email, password, organizationName } = c.req.valid('json')

    try {
      const existing = await UserModel.findOne({ email }, { _id: 1 }).lean()
      if (existing) {
        logger.warn({ email }, 'Auth: register failed — email already in use')
        return ApiResponse.error(c, 'User with this email already exists', 'EMAIL_EXISTS', 400)
      }

      const slug = organizationName.toLowerCase().replace(/\s+/g, '-')
      const org  = await OrganizationModel.create({ name: organizationName, slug })
      const user = new UserModel({ name, email, password, organizationId: org._id, role: 'admin' })
      await user.save()

      const accessToken = await createAccessToken(user)
      setRefreshCookie(c, await createRefreshToken(user))

      logger.info(
        { userId: user._id.toString(), orgId: org._id.toString(), email },
        'Auth: user registered',
      )
      return ApiResponse.success(c, { accessToken }, 'Registration successful', 201)
    } catch (error: unknown) {
      logger.error({ error, email }, 'Auth: register error')
      return ApiResponse.error(c, errMsg(error), 'REGISTER_ERROR', 500)
    }
  },
)

// ── Login ─────────────────────────────────────────────────────────────────────

/**
 * POST /api/auth/login
 * Validates credentials and issues access + refresh tokens.
 * Returns the access token in the body; refresh token is set as an httpOnly cookie.
 */
export const loginHandler = factory.createHandlers(
  zValidator('json', loginSchema),
  async (c) => {
    const { email, password } = c.req.valid('json')

    try {
      const user = await UserModel.findOne({ email })
      if (!user || !(await user.comparePassword(password))) {
        logger.warn({ email }, 'Auth: login failed — invalid credentials')
        return ApiResponse.error(c, 'Invalid credentials', 'INVALID_CREDENTIALS', 401)
      }

      const accessToken = await createAccessToken(user)
      setRefreshCookie(c, await createRefreshToken(user))

      logger.info(
        { userId: user._id.toString(), orgId: user.organizationId.toString(), email },
        'Auth: user logged in',
      )
      return ApiResponse.success(c, { accessToken }, 'Login successful')
    } catch (error: unknown) {
      logger.error({ error, email }, 'Auth: login error')
      return ApiResponse.error(c, errMsg(error), 'LOGIN_ERROR', 500)
    }
  },
)

// ── Refresh ───────────────────────────────────────────────────────────────────

/**
 * POST /api/auth/refresh
 * Exchanges a valid refresh-token cookie for a new access token.
 */
export const refreshHandler = factory.createHandlers(async (c) => {
  const refreshToken = getCookie(c, 'refreshToken')

  if (!refreshToken) {
    return ApiResponse.error(c, 'No refresh token provided', 'NO_REFRESH_TOKEN', 401)
  }

  try {
    const payload = await verify(refreshToken, env.JWT_REFRESH_SECRET, 'HS256')

    const user = await UserModel.findById(payload.sub)
    if (!user) {
      logger.warn({ sub: payload.sub }, 'Auth: refresh failed — user not found')
      return ApiResponse.error(c, 'User not found', 'USER_NOT_FOUND', 401)
    }

    const accessToken = await createAccessToken(user)
    logger.debug({ userId: user._id.toString() }, 'Auth: access token refreshed')
    return ApiResponse.success(c, { accessToken }, 'Token refreshed successfully')
  } catch {
    return ApiResponse.error(c, 'Invalid or expired refresh token', 'INVALID_REFRESH_TOKEN', 401)
  }
})

// ── Logout ────────────────────────────────────────────────────────────────────

/**
 * POST /api/auth/logout
 * Clears the refresh-token cookie on the client.
 */
export const logoutHandler = factory.createHandlers(async (c) => {
  const userId = c.get('userId')
  deleteCookie(c, 'refreshToken')
  logger.info({ userId }, 'Auth: user logged out')
  return ApiResponse.success(c, null, 'Logged out successfully')
})

// ── Profile ───────────────────────────────────────────────────────────────────

/**
 * GET /api/auth/me
 * Returns the authenticated user's profile and organisation name.
 */
export const meHandler = factory.createHandlers(async (c) => {
  const userId = c.get('userId')

  try {
    const user = await UserModel.findById(userId)
      .populate<{ organizationId: IOrganization }>('organizationId')
      .lean()

    if (!user) {
      logger.warn({ userId }, 'Auth: /me — user not found')
      return ApiResponse.error(c, 'User not found', 'USER_NOT_FOUND', 404)
    }

    return ApiResponse.success(c, {
      name:    user.name,
      email:   user.email,
      company: user.organizationId?.name ?? 'No Company',
      role:    user.role,
    }, 'User profile fetched.')
  } catch (error: unknown) {
    logger.error({ error, userId }, 'Auth: /me error')
    return ApiResponse.error(c, errMsg(error), 'FETCH_PROFILE_ERROR', 500)
  }
})

// ── Change password ───────────────────────────────────────────────────────────

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword:     z.string().min(6, 'New password must be at least 6 characters'),
})

/**
 * POST /api/auth/change-password
 * Validates the current password, then hashes and saves the new one.
 */
export const changePasswordHandler = factory.createHandlers(
  zValidator('json', changePasswordSchema),
  async (c) => {
    const userId = c.get('userId')
    const { currentPassword, newPassword } = c.req.valid('json')

    try {
      const user = await UserModel.findById(userId)
      if (!user) {
        logger.warn({ userId }, 'Auth: change-password — user not found')
        return ApiResponse.error(c, 'User not found', 'USER_NOT_FOUND', 404)
      }

      if (!(await user.comparePassword(currentPassword))) {
        logger.warn({ userId }, 'Auth: change-password failed — wrong current password')
        return ApiResponse.error(c, 'Invalid current password', 'INVALID_PASSWORD', 400)
      }

      user.password = newPassword
      await user.save()

      logger.info({ userId }, 'Auth: password changed')
      return ApiResponse.success(c, null, 'Password changed successfully.')
    } catch (error: unknown) {
      logger.error({ error, userId }, 'Auth: change-password error')
      return ApiResponse.error(c, errMsg(error), 'CHANGE_PASSWORD_ERROR', 500)
    }
  },
)
