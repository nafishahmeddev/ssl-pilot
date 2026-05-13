import type { HTMLInputTypeAttribute, ReactNode } from 'react'
import { useState } from 'react'
import type { AnyFieldApi } from '@tanstack/react-form'
import { FieldInfo } from './FieldInfo'
import { Eye, EyeOff } from 'lucide-react'

interface FormInputProps {
  field: AnyFieldApi
  label: string
  type?: HTMLInputTypeAttribute
  placeholder?: string
  icon?: ReactNode
}

export function FormInput({ field, label, type = 'text', placeholder, icon }: FormInputProps) {
  const [showPassword, setShowPassword] = useState(false)
  const isPassword = type === 'password'
  const inputType = isPassword ? (showPassword ? 'text' : 'password') : type

  return (
    <div className="form-control gap-1.5">
      <label className="label py-0" htmlFor={field.name}>
        <span
          className="label-text text-xs font-semibold uppercase tracking-widest"
          style={{ color: 'oklch(52% 0.015 265)' }}
        >
          {label}
        </span>
      </label>
      {/* DaisyUI 5: label wrapper with input class embeds icon + input together */}
      <label className="input input-bordered flex items-center gap-2.5 w-full cursor-text">
        {icon && (
          <span className="shrink-0" style={{ color: 'oklch(44% 0.02 265)' }}>
            {icon}
          </span>
        )}
        <input
          id={field.name}
          name={field.name}
          type={inputType}
          value={field.state.value as string}
          onBlur={field.handleBlur}
          onChange={(e) => field.handleChange(e.target.value as never)}
          className="grow bg-transparent outline-none min-w-0"
          placeholder={placeholder}
        />
        {isPassword && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault()
              setShowPassword(!showPassword)
            }}
            className="btn btn-ghost btn-xs btn-square shrink-0"
            style={{ color: 'oklch(44% 0.02 265)' }}
          >
            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        )}
      </label>
      <FieldInfo field={field} />
    </div>
  )
}
