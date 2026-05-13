import { useMutation } from '@tanstack/react-query'
import { loginApi } from '../api/auth'
import { setAccessToken } from '../store/auth'
import { useNavigate, Link } from 'react-router-dom'
import { useForm } from '@tanstack/react-form'
import { getApiError } from '../api/errors'
import { loginSchema } from '../types/auth'
import type { LoginCredentials } from '../types/auth'
import { AuthCard } from '../components/layout/AuthCard'
import { FormInput } from '../components/form/FormInput'
import { Mail, Lock } from 'lucide-react'

export default function Login() {
  const navigate = useNavigate()

  const mutation = useMutation({
    mutationFn: loginApi,
    onSuccess: (data) => {
      setAccessToken(data.data.accessToken)
      navigate('/dashboard')
    },
  })

  const form = useForm({
    defaultValues: {
      email: '',
      password: '',
    } satisfies LoginCredentials,
    onSubmit: async ({ value }) => {
      mutation.mutate(value)
    },
  })

  return (
    <AuthCard
      title="Welcome back"
      subtitle="Sign in to your SSL Pilot account"
      footer={
        <>
          Don't have an account?{' '}
          <Link to="/register" className="link link-primary font-medium">
            Create one
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
          name="email"
          validators={{ onChange: loginSchema.shape.email }}
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
          validators={{ onChange: loginSchema.shape.password }}
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

        <div className="flex justify-end -mt-1">
          <a href="#" className="text-xs link link-primary">
            Forgot password?
          </a>
        </div>

        {mutation.isError && (
          <div className="alert alert-error text-sm">
            <span>{getApiError(mutation.error, 'Login failed. Please try again.')}</span>
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
                  'Sign in'
                )}
              </button>
            )}
          />
        </div>
      </form>
    </AuthCard>
  )
}
