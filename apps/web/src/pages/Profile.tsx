import { useQuery, useMutation } from '@tanstack/react-query'
import { getProfileApi, changePasswordApi } from '../api/auth'
import { useForm } from '@tanstack/react-form'
import { getApiError } from '../api/errors'
import { FormInput } from '../components/form/FormInput'
import { Lock, Mail, Building, Shield } from 'lucide-react'
import { z } from 'zod'
import { useState } from 'react'

export default function Profile() {
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const { data: profileData, isLoading } = useQuery({
    queryKey: ['profile'],
    queryFn: getProfileApi,
  })
  const profile = profileData?.data

  const mutation = useMutation({
    mutationFn: changePasswordApi,
    onSuccess: () => {
      setSuccessMessage('Password changed successfully.')
      setErrorMessage(null)
      form.reset()
    },
    onError: (error) => {
      setErrorMessage(getApiError(error))
      setSuccessMessage(null)
    },
  })

  const form = useForm({
    defaultValues: {
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    },
    onSubmit: async ({ value }) => {
      mutation.mutate({
        currentPassword: value.currentPassword,
        newPassword: value.newPassword,
      })
    },
  })

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <span className="loading loading-spinner loading-lg" style={{ color: 'var(--c-primary)' }}></span>
      </div>
    )
  }

  return (
    <div className="flex-1 p-6 space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--c-text-1)' }}>Account Settings</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--c-text-3)' }}>Manage your profile and security</p>
      </div>

      {/* ── Profile Info ── */}
      <div
        className="rounded-2xl"
        style={{ background: 'var(--c-card)', border: '1px solid var(--c-border)' }}
      >
        <div className="p-6">
          <div className="flex items-center gap-4 mb-6">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-bold"
              style={{
                background: 'var(--c-primary-soft)',
                color: 'var(--c-primary)',
                border: '1px solid var(--c-primary-mid)',
              }}
            >
              {profile?.name ? profile.name.charAt(0).toUpperCase() : 'U'}
            </div>
            <div>
              <h2 className="text-xl font-bold" style={{ color: 'var(--c-text-1)' }}>{profile?.name}</h2>
              <p className="text-sm" style={{ color: 'var(--c-text-3)' }}>{profile?.role === 'admin' ? 'Administrator' : 'Member'}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-center gap-3 p-4 rounded-xl" style={{ background: 'var(--c-page)' }}>
              <Mail className="w-5 h-5" style={{ color: 'var(--c-text-3)' }} />
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--c-text-3)' }}>Email Address</p>
                <p className="text-sm font-medium" style={{ color: 'var(--c-text-1)' }}>{profile?.email}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-4 rounded-xl" style={{ background: 'var(--c-page)' }}>
              <Building className="w-5 h-5" style={{ color: 'var(--c-text-3)' }} />
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--c-text-3)' }}>Company / Org</p>
                <p className="text-sm font-medium" style={{ color: 'var(--c-text-1)' }}>{profile?.company}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Change Password ── */}
      <div
        className="rounded-2xl"
        style={{ background: 'var(--c-card)', border: '1px solid var(--c-border)' }}
      >
        <div className="p-6">
          <div className="flex items-center gap-3 mb-6">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: 'var(--c-warning-soft)' }}
            >
              <Shield className="w-5 h-5" style={{ color: 'var(--c-warning)' }} />
            </div>
            <div>
              <h2 className="text-lg font-bold" style={{ color: 'var(--c-text-1)' }}>Change Password</h2>
              <p className="text-xs mt-0.5" style={{ color: 'var(--c-text-3)' }}>Update your account password</p>
            </div>
          </div>

          {successMessage && (
            <div className="alert alert-success mb-4 text-sm">
              {successMessage}
            </div>
          )}

          {errorMessage && (
            <div className="alert alert-error mb-4 text-sm">
              {errorMessage}
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault()
              e.stopPropagation()
              form.handleSubmit()
            }}
            className="space-y-4 max-w-md"
          >
            <form.Field
              name="currentPassword"
              validators={{ onChange: z.string().min(1, 'Current password is required') }}
              children={(field) => (
                <FormInput
                  field={field}
                  label="Current Password"
                  type="password"
                  placeholder="••••••••"
                  icon={<Lock className="w-4 h-4" />}
                />
              )}
            />

            <form.Field
              name="newPassword"
              validators={{ onChange: z.string().min(6, 'New password must be at least 6 characters') }}
              children={(field) => (
                <FormInput
                  field={field}
                  label="New Password"
                  type="password"
                  placeholder="••••••••"
                  icon={<Lock className="w-4 h-4" />}
                />
              )}
            />

            <form.Field
              name="confirmPassword"
              validators={{ onChange: z.string().min(1, 'Please confirm your password') }}
              children={(field) => (
                <FormInput
                  field={field}
                  label="Confirm New Password"
                  type="password"
                  placeholder="••••••••"
                  icon={<Lock className="w-4 h-4" />}
                />
              )}
            />

            <div className="pt-2">
              <button
                type="submit"
                className="btn btn-primary"
                disabled={mutation.isPending}
              >
                {mutation.isPending && <span className="loading loading-spinner loading-sm" />}
                Update Password
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
