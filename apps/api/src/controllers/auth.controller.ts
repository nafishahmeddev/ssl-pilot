import { createFactory } from 'hono/factory'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { UserModel } from '@src/models/user.model'
import { OrganizationModel } from '@src/models/organization.model'
import { ApiResponse } from '@src/shared/utils/response'
import { sign, verify } from 'hono/jwt'
import { setCookie, getCookie, deleteCookie } from 'hono/cookie'
import { env } from '@src/shared/config/env'
import type { Env } from '@src/app'

const factory = createFactory<Env>()

// Validation Schemas
const registerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  organizationName: z.string().min(2, 'Organization name must be at least 2 characters')
})

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required')
})

/**
 * Auth Handlers created using Hono Factory.
 * This preserves type safety for c.req.valid() while keeping routes clean.
 */

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
      const org = await OrganizationModel.create({
        name: organizationName,
        slug
      })
      
      const user = new UserModel({
        name,
        email,
        password,
        organizationId: org._id,
        role: 'admin'
      })
      await user.save()
      
      return ApiResponse.success(
        c, 
        { userId: user._id, organizationId: org._id }, 
        'Registration successful', 
        201
      )
    } catch (error: any) {
      return ApiResponse.error(c, error.message, 'REGISTER_ERROR', 500)
    }
  }
)

export const loginHandler = factory.createHandlers(
  zValidator('json', loginSchema),
  async (c) => {
    const { email, password } = c.req.valid('json')
    
    try {
      const user = await UserModel.findOne({ email })
      if (!user) {
        return ApiResponse.error(c, 'Invalid credentials', 'INVALID_CREDENTIALS', 401)
      }
      
      const isMatch = await user.comparePassword(password)
      if (!isMatch) {
        return ApiResponse.error(c, 'Invalid credentials', 'INVALID_CREDENTIALS', 401)
      }
      
      const accessToken = await sign(
        { 
          sub: user._id, 
          organizationId: user.organizationId,
          role: user.role,
          exp: Math.floor(Date.now() / 1000) + 60 * 15 
        }, 
        env.JWT_ACCESS_SECRET
      )
      
      const refreshToken = await sign(
        { 
          sub: user._id, 
          exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7 
        }, 
        env.JWT_REFRESH_SECRET
      )
      
      setCookie(c, 'refreshToken', refreshToken, {
        httpOnly: true,
        secure: env.NODE_ENV === 'production',
        sameSite: 'Strict',
        maxAge: 60 * 60 * 24 * 7
      })
      
      return ApiResponse.success(c, { accessToken }, 'Login successful')
    } catch (error: any) {
      return ApiResponse.error(c, error.message, 'LOGIN_ERROR', 500)
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
    
    const accessToken = await sign(
      { 
        sub: user._id, 
        organizationId: user.organizationId,
        role: user.role,
        exp: Math.floor(Date.now() / 1000) + 60 * 15 
      }, 
      env.JWT_ACCESS_SECRET
    )
    
    return ApiResponse.success(c, { accessToken }, 'Token refreshed successfully')
  } catch (error: any) {
    return ApiResponse.error(c, 'Invalid or expired refresh token', 'INVALID_REFRESH_TOKEN', 401)
  }
})

export const logoutHandler = factory.createHandlers(async (c) => {
  deleteCookie(c, 'refreshToken')
  return ApiResponse.success(c, null, 'Logged out successfully')
})
