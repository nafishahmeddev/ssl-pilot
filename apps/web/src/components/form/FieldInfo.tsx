import type { AnyFieldApi } from '@tanstack/react-form'

interface FieldInfoProps {
  field: AnyFieldApi
}

/**
 * Displays per-field validation errors and validating state.
 * Follows the official TanStack Form FieldInfo docs pattern.
 */
export function FieldInfo({ field }: FieldInfoProps) {
  return (
    <>
      {field.state.meta.isTouched && !field.state.meta.isValid ? (
        <label className="label">
          <span className="label-text-alt text-error">
            {field.state.meta.errors.map((e) => e?.message).join(', ')}
          </span>
        </label>
      ) : null}
      {field.state.meta.isValidating ? (
        <label className="label">
          <span className="label-text-alt text-info">Validating…</span>
        </label>
      ) : null}
    </>
  )
}
