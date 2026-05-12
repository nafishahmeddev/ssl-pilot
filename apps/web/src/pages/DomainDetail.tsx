import { useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getDomainApi, initiateSslApi, recheckSslApi } from '../api/ssl'
import { getApiError } from '../api/errors'
import { useCooldown } from '../hooks/useCooldown'
import type { DomainDetail, DomainStatus, IssuedCertificate } from '../types/ssl'
import {
  ArrowLeft,
  ShieldCheck,
  AlertTriangle,
  AlertCircle,
  Copy,
  Check,
  Download,
  RotateCcw,
  RefreshCw,
  Clock,
  X,
} from 'lucide-react'

interface CertModal extends IssuedCertificate {
  domain: string
}

function daysUntil(isoDate?: string): number | null {
  if (!isoDate) return null
  return Math.floor((new Date(isoDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
}

function fmt(isoDate?: string): string {
  if (!isoDate) return '—'
  return new Date(isoDate).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function certLifetimePct(createdAt: string, expiryDate?: string): number | null {
  if (!expiryDate) return null
  const start  = new Date(createdAt).getTime()
  const end    = new Date(expiryDate).getTime()
  const now    = Date.now()
  if (end <= start) return null
  return Math.min(100, Math.max(0, Math.round(((now - start) / (end - start)) * 100)))
}

export default function DomainDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [certModal, setCertModal] = useState<CertModal | null>(null)

  const initiateCD = useCooldown(45_000)
  const recheckCD  = useCooldown(60_000)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['domain', id],
    queryFn: () => getDomainApi(id!),
    enabled: !!id,
  })

  const domain = data?.data

  const initiateMutation = useMutation({
    mutationFn: (d: string) => initiateSslApi(d),
    onSettled: () => initiateCD.start(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['domain', id] })
      qc.invalidateQueries({ queryKey: ['certificates'] })
    },
  })

  const recheckMutation = useMutation({
    mutationFn: (d: string) => recheckSslApi(d),
    onSettled: () => recheckCD.start(),
    onSuccess: (res) => {
      setCertModal({ domain: domain!.domainName, ...res.data })
      qc.invalidateQueries({ queryKey: ['domain', id] })
      qc.invalidateQueries({ queryKey: ['certificates'] })
    },
  })

  const handleCopy = async (text: string, key: string) => {
    await navigator.clipboard.writeText(text)
    setCopiedKey(key)
    setTimeout(() => setCopiedKey(null), 2000)
  }

  const handleDownload = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = filename; a.click()
    URL.revokeObjectURL(url)
  }

  if (isLoading) {
    return (
      <main className="flex-1 flex items-center justify-center">
        <span className="loading loading-spinner loading-lg" style={{ color: 'var(--c-primary)' }} />
      </main>
    )
  }

  if (isError || !domain) {
    return (
      <main className="flex-1 p-5 lg:p-8 max-w-5xl w-full mx-auto">
        <div className="alert alert-error mt-8">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>Domain not found or you do not have access.</span>
        </div>
        <button onClick={() => navigate('/certificates')} className="btn btn-ghost btn-sm mt-4 gap-2">
          <ArrowLeft className="w-4 h-4" /> Back to Certificates
        </button>
      </main>
    )
  }

  const days           = daysUntil(domain.expiryDate)
  const isExpiringSoon = days !== null && days >= 0 && days <= 30
  const hasExpired     = days !== null && days < 0
  const lifetimePct    = certLifetimePct(domain.createdAt, domain.expiryDate)

  const daysColor = hasExpired
    ? 'var(--c-error)'
    : isExpiringSoon
    ? 'var(--c-warning)'
    : 'var(--c-success)'

  return (
    <main className="flex-1 p-5 lg:p-8 max-w-5xl w-full mx-auto space-y-5">

      {/* Breadcrumb + header */}
      <div className="pt-1">
        <Link
          to="/certificates"
          className="flex items-center gap-1.5 text-sm mb-4"
          style={{ color: 'var(--c-text-2)' }}
        >
          <ArrowLeft className="w-4 h-4" />
          Certificates
        </Link>
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl font-bold font-mono" style={{ color: 'var(--c-text-1)' }}>
            {domain.domainName}
          </h1>
          <StatusBadge status={domain.status} expiring={isExpiringSoon} />
        </div>
        <p className="text-sm mt-1" style={{ color: 'var(--c-text-2)' }}>
          SSL certificate details and management
        </p>
      </div>

      {/* ── Bento Info Grid ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">

        {/* Featured: Days Left */}
        <div
          className="col-span-2 rounded-2xl p-5 flex flex-col gap-3"
          style={{ background: 'var(--c-card)', border: '1px solid var(--c-border)' }}
        >
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--c-text-3)' }}>
              Days Remaining
            </p>
            <Clock className="w-4 h-4" style={{ color: 'var(--c-text-3)' }} />
          </div>

          <p className="text-5xl font-bold leading-none" style={{ color: daysColor }}>
            {days === null ? '—' : days < 0 ? 'Exp.' : days}
          </p>

          {lifetimePct !== null && !hasExpired && (
            <div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--c-surface-2)' }}>
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${lifetimePct}%`, background: daysColor }}
                />
              </div>
              <p className="text-xs mt-1.5" style={{ color: 'var(--c-text-3)' }}>
                {lifetimePct}% of cert lifetime used
              </p>
            </div>
          )}

          {hasExpired && (
            <p className="text-xs" style={{ color: 'var(--c-error)' }}>Certificate has expired</p>
          )}
        </div>

        {/* Issued */}
        <div
          className="rounded-2xl p-5 flex flex-col gap-2"
          style={{ background: 'var(--c-card)', border: '1px solid var(--c-border)' }}
        >
          <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--c-text-3)' }}>Issued</p>
          <p className="text-sm font-semibold" style={{ color: 'var(--c-primary)' }}>{fmt(domain.createdAt)}</p>
        </div>

        {/* Expires */}
        <div
          className="rounded-2xl p-5 flex flex-col gap-2"
          style={{ background: 'var(--c-card)', border: '1px solid var(--c-border)' }}
        >
          <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--c-text-3)' }}>Expires</p>
          <p className="text-sm font-semibold" style={{ color: daysColor }}>{fmt(domain.expiryDate)}</p>
        </div>

      </div>

      {/* ── Auto-Renewal Failure Banner ── */}
      {domain.renewalError && (
        <div
          className="rounded-xl p-5"
          style={{ background: 'var(--c-card)', border: '1px solid oklch(58% 0.22 25 / 0.35)' }}
        >
          <div className="flex items-start gap-3 mb-4">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: 'var(--c-error-soft)' }}
            >
              <AlertCircle className="w-5 h-5" style={{ color: 'var(--c-error)' }} />
            </div>
            <div>
              <p className="font-semibold text-sm" style={{ color: 'var(--c-text-1)' }}>Auto-Renewal Failed</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--c-text-2)' }}>
                The scheduled renewal could not initiate automatically. Manual action required.
              </p>
              {domain.renewalFailedAt && (
                <p className="text-xs mt-1" style={{ color: 'var(--c-text-3)' }}>
                  Failed at: {new Date(domain.renewalFailedAt).toLocaleString()}
                </p>
              )}
            </div>
          </div>
          <div
            className="rounded-lg p-3 mb-4 font-mono text-xs break-all"
            style={{ background: 'var(--c-code-bg)', border: '1px solid var(--c-border)', color: 'var(--c-error)' }}
          >
            {domain.renewalError}
          </div>
          <button
            onClick={() => initiateMutation.mutate(domain.domainName)}
            disabled={initiateMutation.isPending || initiateCD.isCooling}
            className="btn btn-sm gap-2"
            style={{
              background: 'var(--c-error-soft)',
              borderColor: 'oklch(58% 0.22 25 / 0.35)',
              color: 'var(--c-error)',
            }}
          >
            {initiateMutation.isPending
              ? <span className="loading loading-spinner loading-xs" />
              : <RotateCcw className="w-3.5 h-3.5" />}
            {initiateCD.isCooling
              ? `Wait ${initiateCD.secondsLeft}s`
              : 'Trigger Manual Renewal'}
          </button>
          {initiateMutation.isError && (
            <p className="text-xs mt-2" style={{ color: 'var(--c-error)' }}>
              {getApiError(initiateMutation.error, 'Failed to initiate renewal.')}
            </p>
          )}
        </div>
      )}

      {/* ── DNS Challenge Card ── */}
      {domain.status === 'pending_challenge' && (
        <div
          className="rounded-2xl"
          style={{ background: 'var(--c-card)', border: '1px solid oklch(72% 0.19 80 / 0.35)' }}
        >
          <div className="p-6">
            <div className="flex items-start gap-3 mb-5">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: 'var(--c-warning-soft)' }}
              >
                <AlertTriangle className="w-5 h-5" style={{ color: 'var(--c-warning)' }} />
              </div>
              <div>
                <p className="font-semibold" style={{ color: 'var(--c-text-1)' }}>DNS Challenge Required</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--c-text-2)' }}>
                  Add this TXT record to your DNS provider to verify domain ownership.
                </p>
              </div>
            </div>

            <div
              className="rounded-xl p-4 space-y-4 font-mono text-sm"
              style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-wider" style={{ color: 'var(--c-text-3)' }}>Type</span>
                <span className="badge badge-neutral font-mono text-xs">TXT</span>
              </div>
              {[
                {
                  label: 'Name',
                  value: domain.txtRecordName ?? `_acme-challenge.${domain.domainName}`,
                  key: 'txt-name',
                  color: 'var(--c-info)',
                },
                {
                  label: 'Value',
                  value: domain.txtRecordValue ?? '(not available)',
                  key: 'txt-value',
                  color: 'var(--c-purple)',
                },
              ].map(({ label, value, key, color }) => (
                <div key={key} className="space-y-1.5">
                  <span className="text-xs uppercase tracking-wider" style={{ color: 'var(--c-text-3)' }}>{label}</span>
                  <div className="flex items-start gap-2">
                    <span className="flex-1 break-all" style={{ color }}>{value}</span>
                    <button
                      onClick={() => handleCopy(value, key)}
                      className="btn btn-ghost btn-xs btn-square shrink-0"
                    >
                      {copiedKey === key
                        ? <Check className="w-3.5 h-3.5 text-success" />
                        : <Copy className="w-3.5 h-3.5" style={{ color: 'var(--c-text-2)' }} />}
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <p className="text-xs mt-3" style={{ color: 'var(--c-text-3)' }}>
              DNS propagation can take a few minutes. Click verify once the record is live.
            </p>

            {recheckMutation.isError && (
              <div className="alert alert-error mt-3 text-sm">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{getApiError(recheckMutation.error, 'Verification failed — DNS may not have propagated yet.')}</span>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3 justify-between mt-4">
              <button
                onClick={() => initiateMutation.mutate(domain.domainName)}
                disabled={initiateMutation.isPending || initiateCD.isCooling}
                className="btn btn-ghost btn-sm gap-2"
              >
                {initiateMutation.isPending
                  ? <span className="loading loading-spinner loading-xs" />
                  : <RotateCcw className="w-3.5 h-3.5" />}
                {initiateCD.isCooling ? `Wait ${initiateCD.secondsLeft}s` : 'Re-initiate Order'}
              </button>
              <button
                onClick={() => recheckMutation.mutate(domain.domainName)}
                disabled={recheckMutation.isPending || recheckCD.isCooling}
                className="btn btn-success gap-2"
              >
                {recheckMutation.isPending
                  ? <><span className="loading loading-spinner loading-sm" /> Verifying…</>
                  : recheckCD.isCooling
                  ? <><RefreshCw className="w-4 h-4" /> Wait {recheckCD.secondsLeft}s</>
                  : <><ShieldCheck className="w-4 h-4" /> Verify &amp; Issue</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Stored Certificate (active) ── */}
      {domain.status === 'active' && domain.certPem && (
        <div
          className="rounded-2xl"
          style={{ background: 'var(--c-card)', border: '1px solid var(--c-primary-mid)' }}
        >
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center"
                  style={{ background: 'var(--c-success-soft)' }}
                >
                  <ShieldCheck className="w-5 h-5" style={{ color: 'var(--c-success)' }} />
                </div>
                <div>
                  <p className="font-semibold" style={{ color: 'var(--c-text-1)' }}>Certificate</p>
                  <p className="text-xs" style={{ color: 'var(--c-text-2)' }}>Last issued certificate (PEM)</p>
                </div>
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => handleCopy(domain.certPem!, 'cert-pem')}
                  className="btn btn-ghost btn-xs gap-1.5"
                >
                  {copiedKey === 'cert-pem'
                    ? <Check className="w-3.5 h-3.5 text-success" />
                    : <Copy className="w-3.5 h-3.5" />}
                  {copiedKey === 'cert-pem' ? 'Copied' : 'Copy'}
                </button>
                <button
                  onClick={() => handleDownload(domain.certPem!, `${domain.domainName}.crt`)}
                  className="btn btn-ghost btn-xs gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download
                </button>
              </div>
            </div>
            <div
              className="rounded-xl p-4 font-mono text-xs overflow-x-auto"
              style={{
                background: 'var(--c-code-bg)',
                border: '1px solid var(--c-border)',
                color: 'var(--c-info)',
              }}
            >
              <pre className="whitespace-pre-wrap break-all">
                {domain.certPem.trim().split('\n').slice(0, 6).join('\n')}
                {domain.certPem.trim().split('\n').length > 6 && '\n…'}
              </pre>
            </div>
          </div>
        </div>
      )}

      {/* ── Actions (failed / expired without renewalError) ── */}
      {(domain.status === 'failed' || (domain.status === 'expired' && !domain.renewalError)) && (
        <div
          className="rounded-2xl"
          style={{ background: 'var(--c-card)', border: '1px solid var(--c-border)' }}
        >
          <div className="p-6">
            <p className="font-semibold mb-1" style={{ color: 'var(--c-text-1)' }}>
              {domain.status === 'failed' ? 'Certificate Failed' : 'Certificate Expired'}
            </p>
            <p className="text-sm mb-4" style={{ color: 'var(--c-text-2)' }}>
              {domain.status === 'failed'
                ? 'Verification failed. Retry to start a fresh ACME challenge.'
                : 'Certificate has expired. Renew to begin a new issuance flow.'}
            </p>
            <button
              onClick={() => initiateMutation.mutate(domain.domainName)}
              disabled={initiateMutation.isPending || initiateCD.isCooling}
              className="btn btn-primary btn-sm gap-2"
            >
              {initiateMutation.isPending
                ? <span className="loading loading-spinner loading-xs" />
                : <RotateCcw className="w-3.5 h-3.5" />}
              {initiateCD.isCooling
                ? `Wait ${initiateCD.secondsLeft}s`
                : domain.status === 'failed'
                ? 'Retry Issuance'
                : 'Renew Certificate'}
            </button>
            {initiateMutation.isError && (
              <p className="text-xs mt-2" style={{ color: 'var(--c-error)' }}>
                {getApiError(initiateMutation.error, 'Failed to initiate.')}
              </p>
            )}
          </div>
        </div>
      )}

      {certModal && (
        <CertModal
          cert={certModal}
          copiedKey={copiedKey}
          onCopy={handleCopy}
          onDownload={handleDownload}
          onClose={() => setCertModal(null)}
        />
      )}

    </main>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusBadge({ status, expiring }: { status: DomainStatus; expiring?: boolean }) {
  if (status === 'active' && expiring) {
    return (
      <span className="badge badge-warning gap-1">
        <AlertTriangle className="w-3 h-3" />
        Expiring Soon
      </span>
    )
  }
  const map: Record<DomainStatus, { label: string; cls: string }> = {
    active:            { label: 'Active',      cls: 'badge-success' },
    pending:           { label: 'Pending',     cls: 'badge-neutral' },
    pending_challenge: { label: 'DNS Pending', cls: 'badge-warning' },
    expired:           { label: 'Expired',     cls: 'badge-error'   },
    failed:            { label: 'Failed',      cls: 'badge-error'   },
  }
  const { label, cls } = map[status]
  return <span className={`badge ${cls}`}>{label}</span>
}

function CertModal({
  cert, copiedKey, onCopy, onDownload, onClose,
}: {
  cert: CertModal
  copiedKey: string | null
  onCopy: (text: string, key: string) => void
  onDownload: (content: string, filename: string) => void
  onClose: () => void
}) {
  return (
    <div className="modal modal-open">
      <div
        className="modal-box max-w-2xl"
        style={{ background: 'var(--c-card)', border: '1px solid var(--c-primary-mid)' }}
      >
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: 'var(--c-success-soft)' }}
            >
              <ShieldCheck className="w-5 h-5" style={{ color: 'var(--c-success)' }} />
            </div>
            <div>
              <h3 className="font-bold text-lg leading-none" style={{ color: 'var(--c-text-1)' }}>Certificate Issued</h3>
              <p className="text-xs mt-1 font-mono" style={{ color: 'var(--c-info)' }}>{cert.domain}</p>
            </div>
          </div>
          <button onClick={onClose} className="btn btn-ghost btn-sm btn-square">
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-sm mb-5" style={{ color: 'var(--c-text-2)' }}>
          Save both files securely — the private key is shown only once.
        </p>

        {[
          { label: 'Certificate', value: cert.cert, key: 'modal-cert', filename: `${cert.domain}.crt`, color: 'var(--c-info)'   },
          { label: 'Private Key', value: cert.key,  key: 'modal-key',  filename: `${cert.domain}.key`, color: 'var(--c-purple)' },
        ].map(({ label, value, key, filename, color }) => (
          <div key={key} className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--c-text-2)' }}>
                {label}
              </span>
              <div className="flex gap-1">
                <button onClick={() => onCopy(value, key)} className="btn btn-ghost btn-xs gap-1.5">
                  {copiedKey === key ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedKey === key ? 'Copied' : 'Copy'}
                </button>
                <button onClick={() => onDownload(value, filename)} className="btn btn-ghost btn-xs gap-1.5">
                  <Download className="w-3.5 h-3.5" />
                  Download
                </button>
              </div>
            </div>
            <div
              className="rounded-xl p-4 font-mono text-xs overflow-x-auto"
              style={{ background: 'var(--c-code-bg)', border: '1px solid var(--c-border)', color }}
            >
              <pre className="whitespace-pre-wrap break-all">
                {value.trim().split('\n').slice(0, 4).join('\n')}
                {value.trim().split('\n').length > 4 && '\n…'}
              </pre>
            </div>
          </div>
        ))}

        <div className="modal-action mt-2">
          <button onClick={onClose} className="btn btn-primary btn-sm">Done</button>
        </div>
      </div>
      <div className="modal-backdrop" onClick={onClose} />
    </div>
  )
}
