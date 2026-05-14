import { useMutation } from '@tanstack/react-query'
import { registerApi } from '../api/auth'
import { setAccessToken } from '../store/auth'
import { useNavigate, Link } from 'react-router-dom'
import { useForm } from '@tanstack/react-form'
import { getApiError } from '../api/errors'
import { registerSchema } from '../types/auth'
import type { RegisterCredentials } from '../types/auth'
import { AuthCard } from '../components/layout/AuthCard'
import { FormInput } from '../components/form/FormInput'
import { User, Building2, Mail, Lock } from 'lucide-react'

export default function Register() {
  const navigate = useNavigate()

  const mutation = useMutation({
    mutationFn: registerApi,
    onSuccess: (data) => {
      setAccessToken(data.data.accessToken)
      navigate('/dashboard')
    },
  })

  const form = useForm({
    defaultValues: {
      name: '',
      organizationName: '',
      email: '',
      password: '',
    } satisfies RegisterCredentials,
    onSubmit: async ({ value }) => {
      await mutation.mutateAsync(value)
    },
  })

  return (
    <AuthCard
      title="Create account"
      subtitle="Start managing your SSL certificates today"
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="link link-primary font-medium">
            Sign in
          </Link>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          e.stopPropagation()
          form.handleSubmit()
        }}
        className="space-y-4"
      >
        <form.Field
          name="name"
          validators={{ onChange: registerSchema.shape.name }}
          children={(field) => (
            <FormInput
              field={field}
              label="Full Name"
              placeholder="John Doe"
              icon={<User className="w-4 h-4" />}
            />
          )}
        />

        <form.Field
          name="organizationName"
          validators={{ onChange: registerSchema.shape.organizationName }}
          children={(field) => (
            <FormInput
              field={field}
              label="Organization"
              placeholder="Acme Corp"
              icon={<Building2 className="w-4 h-4" />}
            />
          )}
        />

        <form.Field
          name="email"
          validators={{ onChange: registerSchema.shape.email }}
          children={(field) => (
            <FormInput
              field={field}
              label="Email"
              type="email"
              placeholder="you@example.com"
              icon={<Mail className="w-4 h-4" />}
            />
          )}
        />

        <form.Field
          name="password"
          validators={{ onChange: registerSchema.shape.password }}
          children={(field) => (
            <FormInput
              field={field}
              label="Password"
              type="password"
              placeholder="••••••••"
              icon={<Lock className="w-4 h-4" />}
            />
          )}
        />

        {mutation.isError && (
          <div className="alert alert-error text-sm">
            <span>{getApiError(mutation.error, 'Registration failed. Please try again.')}</span>
          </div>
        )}

        <div className="form-control mt-2">
          <form.Subscribe
            selector={(state) => [state.canSubmit, state.isSubmitting]}
            children={([canSubmit, isSubmitting]) => (
              <button
                type="submit"
                disabled={!canSubmit || mutation.isPending}
                className="btn btn-primary w-full"
              >
                {isSubmitting || mutation.isPending ? (
                  <span className="loading loading-spinner" />
                ) : (
                  'Create account'
                )}
              </button>
            )}
          />
        </div>
      </form>
    </AuthCard>
  )
}
