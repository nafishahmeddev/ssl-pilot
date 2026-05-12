import mongoose from 'mongoose'
import { env } from '@src/shared/config/env'
import { logger } from '@src/shared/utils/logger'

/**
 * Connects to the MongoDB database using Mongoose.
 */
export const connectDB = async () => {
  try {
    const conn = await mongoose.connect(env.MONGODB_URI)
    logger.info(`MongoDB Connected: ${conn.connection.host}`)
  } catch (error) {
    logger.error(error, 'Error connecting to MongoDB')
    process.exit(1)
  }
}

// Handle connection events
mongoose.connection.on('error', (err) => {
  logger.error(err, 'MongoDB connection error')
})

mongoose.connection.on('disconnected', () => {
  logger.warn('MongoDB disconnected')
})
