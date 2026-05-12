import { logger } from '@src/shared/utils/logger'
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'
import { env } from '@src/shared/config/env'

/**
 * Service for secure storage operations.
 * Handles AES-256-GCM encryption and decryption of private keys.
 * 
 * Best Practice: We use AES-256-GCM because it provides both confidentiality
 * and authenticity (integrity). It prevents tampering with the encrypted data.
 */
export class VaultService {
  private readonly algorithm = 'aes-256-gcm'
  private readonly key = Buffer.from(env.VAULT_MASTER_KEY, 'hex') 

  /**
   * Encrypts plain text data using AES-256-GCM.
   * 
   * @param data The sensitive string to encrypt (e.g., private key).
   * @returns A string in the format `iv:encryptedData:authTag` (all hex encoded).
   */
  async encrypt(data: string): Promise<string> {
    logger.debug('Encrypting sensitive data in Vault')
    
    try {
      const iv = randomBytes(12) // GCM standard IV length is 12 bytes
      const cipher = createCipheriv(this.algorithm, this.key, iv)
      
      let encrypted = cipher.update(data, 'utf8', 'hex')
      encrypted += cipher.final('hex')
      
      const authTag = cipher.getAuthTag().toString('hex')
      
      // Return the IV, the encrypted data, and the auth tag.
      // All three are needed for decryption.
      return `${iv.toString('hex')}:${encrypted}:${authTag}`
    } catch (error) {
      logger.error(error, 'Encryption failed')
      throw error
    }
  }

  /**
   * Decrypts data using AES-256-GCM.
   * 
   * @param encryptedData A string in the format `iv:encryptedData:authTag`.
   * @returns The decrypted plain text string.
   * @throws Error if authentication fails or data is corrupted.
   */
  async decrypt(encryptedData: string): Promise<string> {
    logger.debug('Decrypting sensitive data from Vault')
    
    try {
      const [ivHex, encrypted, authTagHex] = encryptedData.split(':')
      
      if (!ivHex || !encrypted || !authTagHex) {
        throw new Error('Invalid encrypted data format. Expected iv:data:tag')
      }
      
      const iv = Buffer.from(ivHex, 'hex')
      const authTag = Buffer.from(authTagHex, 'hex')
      
      const decipher = createDecipheriv(this.algorithm, this.key, iv)
      decipher.setAuthTag(authTag)
      
      let decrypted = decipher.update(encrypted, 'hex', 'utf8')
      decrypted += decipher.final('utf8')
      
      return decrypted
    } catch (error) {
      logger.error(error, 'Decryption failed (possibly bad key or tampered data)')
      throw error
    }
  }
}

export const vaultService = new VaultService()
