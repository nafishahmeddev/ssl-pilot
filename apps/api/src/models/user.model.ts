import { Schema, model, Document } from 'mongoose'
import bcrypt from 'bcryptjs'

/**
 * Interface for User document.
 */
export interface IUser extends Document {
  name: string
  email: string
  password: string
  organizationId: Schema.Types.ObjectId
  role: 'admin' | 'member'
  comparePassword(password: string): Promise<boolean>
}

const userSchema = new Schema<IUser>({
  name: { 
    type: String, 
    required: [true, 'Name is required'],
    trim: true
  },
  email: { 
    type: String, 
    required: [true, 'Email is required'],
    unique: true,
    trim: true,
    lowercase: true
  },
  password: { 
    type: String, 
    required: [true, 'Password is required']
  },
  organizationId: {
    type: Schema.Types.ObjectId,
    ref: 'Organization',
    required: true
  },
  role: {
    type: String,
    enum: ['admin', 'member'],
    default: 'admin'
  }
}, {
  timestamps: true
})

// Pre-save hook to hash password if modified
userSchema.pre('save', async function() {
  if (!this.isModified('password')) return
  
  const salt = await bcrypt.genSalt(10)
  this.password = await bcrypt.hash(this.password, salt)
})

// Method to compare password for login
userSchema.methods.comparePassword = async function(password: string): Promise<boolean> {
  return bcrypt.compare(password, this.password)
}

export const UserModel = model<IUser>('User', userSchema)
