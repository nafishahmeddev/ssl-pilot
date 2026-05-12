import { useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getDomainApi, initiateSslApi, recheckSslApi } from '../api/ssl'
import { getApiError } from '../api/errors'
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
  Calendar,
  Globe,
  X,
} from 'lucide-react'

interface CertModal extends IssuedCertificate {
  domain: string
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function daysUntil(isoDate?: string): number | null {
  if (!isoDate) return null
  return Math.floor((new Date(isoDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
}

function fmt(isoDate?: string): string {
  if (!isoDate) return '—'
  return new Date(isoDate).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function DomainDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [certModal, setCertModal] = useState<CertModal | null>(null)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['domain', id],
    queryFn: () => getDomainApi(id!),
    enabled: !!id,
  })

  const domain = data?.data

  // ── Mutations ──────────────────────────────────────────────────────────────

  const initiateMutation = useMutation({
    mutationFn: (d: string) => initiateSslApi(d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['domain', id] })
      qc.invalidateQueries({ queryKey: ['certificates'] })
    },
  })

  const recheckMutation = useMutation({
    mutationFn: (d: string) => recheckSslApi(d),
    onSuccess: (res) => {
      setCertModal({ domain: domain!.domainName, ...res.data })
      qc.invalidateQueries({ queryKey: ['domain', id] })
      qc.invalidateQueries({ queryKey: ['certificates'] })
    },
  })

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleCopy = async (text: string, key: string) => {
    await navigator.clipboard.writeText(text)
    setCopiedKey(key)
    setTimeout(() => setCopiedKey(null), 2000)
  }

  const handleDownload = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── Loading / error states ─────────────────────────────────────────────────

  if (isLoading) {
    return (
      <main className="flex-1 flex items-center justify-center">
        <span className="loading loading-spinner loading-lg" style={{ color: 'oklch(62% 0.26 265)' }} />
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

  const days = daysUntil(domain.expiryDate)
  const isExpiringSoon = days !== null && days >= 0 && days <= 30
  const hasExpired = days !== null && days < 0

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <main className="flex-1 p-5 lg:p-8 max-w-5xl w-full mx-auto space-y-6">

      {/* Breadcrumb */}
      <div className="pt-1">
        <Link
          to="/certificates"
          className="flex items-center gap-1.5 text-sm mb-4"
          style={{ color: 'oklch(52% 0.015 265)' }}
        >
          <ArrowLeft className="w-4 h-4" />
          Certificates
        </Link>

        <div className="flex items-start gap-3">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold font-mono">{domain.domainName}</h1>
              <StatusBadge status={domain.status} expiring={isExpiringSoon} />
            </div>
            <p className="text-sm mt-1" style={{ color: 'oklch(52% 0.015 265)' }}>
              SSL certificate details and management
            </p>
          </div>
        </div>
      </div>

      {/* Info Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          {
            icon: Calendar,
            label: 'Issued',
            value: fmt(domain.createdAt),
            color: 'oklch(62% 0.26 265)',
          },
          {
            icon: Clock,
            label: 'Expires',
            value: fmt(domain.expiryDate),
            color: hasExpired
              ? 'oklch(65% 0.22 25)'
              : isExpiringSoon
              ? 'oklch(78% 0.18 78)'
              : 'oklch(52% 0.015 265)',
          },
          {
            icon: RefreshCw,
            label: 'Days Left',
            value: days === null ? '—' : days < 0 ? 'Expired' : `${days}d`,
            color: hasExpired
              ? 'oklch(65% 0.22 25)'
              : isExpiringSoon
              ? 'oklch(78% 0.18 78)'
              : 'oklch(70% 0.20 150)',
          },
          {
            icon: Globe,
            label: 'Last Updated',
            value: fmt(domain.updatedAt),
            color: 'oklch(52% 0.015 265)',
          },
        ].map(({ icon: Icon, label, value, color }) => (
          <div
            key={label}
            className="card"
            style={{ background: 'oklch(17% 0.025 265)', border: '1px solid oklch(26% 0.03 265 / 0.5)' }}
          >
            <div className="card-body p-4 gap-2">
              <div className="flex items-center gap-2" style={{ color: 'oklch(44% 0.02 265)' }}>
                <Icon className="w-3.5 h-3.5" />
                <span className="text-xs font-semibold uppercase tracking-wider">{label}</span>
              </div>
              <p className="font-semibold text-sm" style={{ color }}>{value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Auto-Renewal Failure Banner ── */}
      {domain.renewalError && (
        <div
          className="rounded-xl p-5"
          style={{ background: 'oklch(17% 0.025 265)', border: '1px solid oklch(65% 0.22 25 / 0.4)' }}
        >
          <div className="flex items-start gap-3 mb-4">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: 'oklch(65% 0.22 25 / 0.12)' }}
            >
              <AlertCircle className="w-5 h-5" style={{ color: 'oklch(65% 0.22 25)' }} />
            </div>
            <div>
              <p className="font-semibold text-sm">Auto-Renewal Failed</p>
              <p className="text-xs mt-0.5" style={{ color: 'oklch(52% 0.015 265)' }}>
                The scheduled renewal could not initiate automatically. Manual action required.
              </p>
              {domain.renewalFailedAt && (
                <p className="text-xs mt-1" style={{ color: 'oklch(44% 0.02 265)' }}>
                  Failed at: {new Date(domain.renewalFailedAt).toLocaleString()}
                </p>
              )}
            </div>
          </div>
          <div
            className="rounded-lg p-3 mb-4 font-mono text-xs break-all"
            style={{ background: 'oklch(13% 0.02 265)', color: 'oklch(65% 0.22 25)' }}
          >
            {domain.renewalError}
          </div>
          <button
            onClick={() => initiateMutation.mutate(domain.domainName)}
            disabled={initiateMutation.isPending}
            className="btn btn-sm gap-2"
            style={{ background: 'oklch(65% 0.22 25 / 0.15)', borderColor: 'oklch(65% 0.22 25 / 0.4)', color: 'oklch(65% 0.22 25)' }}
          >
            {initiateMutation.isPending
              ? <span className="loading loading-spinner loading-xs" />
              : <RotateCcw className="w-3.5 h-3.5" />}
            Trigger Manual Renewal
          </button>
          {initiateMutation.isError && (
            <p className="text-xs mt-2" style={{ color: 'oklch(65% 0.22 25)' }}>
              {getApiError(initiateMutation.error, 'Failed to initiate renewal.')}
            </p>
          )}
        </div>
      )}

      {/* ── DNS Challenge Card ── */}
      {domain.status === 'pending_challenge' && (
        <div
          className="card"
          style={{ background: 'oklch(17% 0.025 265)', border: '1px solid oklch(78% 0.18 78 / 0.3)' }}
        >
          <div className="card-body p-6">
            <div className="flex items-start gap-3 mb-5">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: 'oklch(78% 0.18 78 / 0.1)' }}
              >
                <AlertTriangle className="w-5 h-5" style={{ color: 'oklch(78% 0.18 78)' }} />
              </div>
              <div>
                <p className="font-semibold">DNS Challenge Required</p>
                <p className="text-xs mt-0.5" style={{ color: 'oklch(52% 0.015 265)' }}>
                  Add this TXT record to your DNS provider to verify domain ownership.
                </p>
              </div>
            </div>

            <div
              className="rounded-xl p-4 space-y-4 font-mono text-sm"
              style={{ background: 'oklch(13% 0.02 265)', border: '1px solid oklch(22% 0.03 265 / 0.6)' }}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-wider" style={{ color: 'oklch(44% 0.02 265)' }}>Type</span>
                <span className="badge badge-neutral font-mono text-xs">TXT</span>
              </div>
              {[
                {
                  label: 'Name',
                  value: domain.txtRecordName ?? `_acme-challenge.${domain.domainName}`,
                  key: 'txt-name',
                  color: 'oklch(74% 0.20 196)',
                },
                {
                  label: 'Value',
                  value: domain.txtRecordValue ?? '(not available)',
                  key: 'txt-value',
                  color: 'oklch(78% 0.18 300)',
                },
              ].map(({ label, value, key, color }) => (
                <div key={key} className="space-y-1.5">
                  <span className="text-xs uppercase tracking-wider" style={{ color: 'oklch(44% 0.02 265)' }}>{label}</span>
                  <div className="flex items-start gap-2">
                    <span className="flex-1 break-all" style={{ color }}>{value}</span>
                    <button
                      onClick={() => handleCopy(value, key)}
                      className="btn btn-ghost btn-xs btn-square shrink-0"
                    >
                      {copiedKey === key
                        ? <Check className="w-3.5 h-3.5 text-success" />
                        : <Copy className="w-3.5 h-3.5" style={{ color: 'oklch(46% 0.02 265)' }} />}
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <p className="text-xs mt-3" style={{ color: 'oklch(42% 0.015 265)' }}>
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
                disabled={initiateMutation.isPending}
                className="btn btn-ghost btn-sm gap-2"
              >
                {initiateMutation.isPending
                  ? <span className="loading loading-spinner loading-xs" />
                  : <RotateCcw className="w-3.5 h-3.5" />}
                Re-initiate Order
              </button>
              <button
                onClick={() => recheckMutation.mutate(domain.domainName)}
                disabled={recheckMutation.isPending}
                className="btn btn-success gap-2"
              >
                {recheckMutation.isPending
                  ? <><span className="loading loading-spinner loading-sm" /> Verifying…</>
                  : <><ShieldCheck className="w-4 h-4" /> Verify &amp; Issue</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Stored Certificate (active) ── */}
      {domain.status === 'active' && domain.certPem && (
        <div
          className="card"
          style={{ background: 'oklch(17% 0.025 265)', border: '1px solid oklch(70% 0.20 150 / 0.3)' }}
        >
          <div className="card-body p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center"
                  style={{ background: 'oklch(70% 0.20 150 / 0.12)' }}
                >
                  <ShieldCheck className="w-5 h-5" style={{ color: 'oklch(70% 0.20 150)' }} />
                </div>
                <div>
                  <p className="font-semibold">Certificate</p>
                  <p className="text-xs" style={{ color: 'oklch(52% 0.015 265)' }}>
                    Last issued certificate (PEM)
                  </p>
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
                background: 'oklch(13% 0.02 265)',
                border: '1px solid oklch(22% 0.03 265 / 0.6)',
                color: 'oklch(74% 0.20 196)',
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
          className="card"
          style={{ background: 'oklch(17% 0.025 265)', border: '1px solid oklch(26% 0.03 265 / 0.5)' }}
        >
          <div className="card-body p-6">
            <p className="font-semibold mb-1">
              {domain.status === 'failed' ? 'Certificate Failed' : 'Certificate Expired'}
            </p>
            <p className="text-sm mb-4" style={{ color: 'oklch(52% 0.015 265)' }}>
              {domain.status === 'failed'
                ? 'Verification failed. Retry to start a fresh ACME challenge.'
                : 'Certificate has expired. Renew to begin a new issuance flow.'}
            </p>
            <button
              onClick={() => initiateMutation.mutate(domain.domainName)}
              disabled={initiateMutation.isPending}
              className="btn btn-primary btn-sm gap-2"
            >
              {initiateMutation.isPending
                ? <span className="loading loading-spinner loading-xs" />
                : <RotateCcw className="w-3.5 h-3.5" />}
              {domain.status === 'failed' ? 'Retry Issuance' : 'Renew Certificate'}
            </button>
            {initiateMutation.isError && (
              <p className="text-xs mt-2" style={{ color: 'oklch(65% 0.22 25)' }}>
                {getApiError(initiateMutation.error, 'Failed to initiate.')}
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── Certificate Modal (after verify/recheck) ── */}
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
    active: { label: 'Active', cls: 'badge-success' },
    pending: { label: 'Pending', cls: 'badge-neutral' },
    pending_challenge: { label: 'DNS Pending', cls: 'badge-warning' },
    expired: { label: 'Expired', cls: 'badge-error' },
    failed: { label: 'Failed', cls: 'badge-error' },
  }
  const { label, cls } = map[status]
  return <span className={`badge ${cls}`}>{label}</span>
}

function CertModal({
  cert,
  copiedKey,
  onCopy,
  onDownload,
  onClose,
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
        style={{ background: 'oklch(17% 0.025 265)', border: '1px solid oklch(70% 0.20 150 / 0.3)' }}
      >
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: 'oklch(70% 0.20 150 / 0.12)' }}
            >
              <ShieldCheck className="w-5 h-5" style={{ color: 'oklch(70% 0.20 150)' }} />
            </div>
            <div>
              <h3 className="font-bold text-lg leading-none">Certificate Issued</h3>
              <p className="text-xs mt-1 font-mono" style={{ color: 'oklch(74% 0.20 196)' }}>{cert.domain}</p>
            </div>
          </div>
          <button onClick={onClose} className="btn btn-ghost btn-sm btn-square">
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-sm mb-5" style={{ color: 'oklch(52% 0.015 265)' }}>
          Save both files securely — the private key is shown only once.
        </p>

        {[
          { label: 'Certificate', value: cert.cert, key: 'modal-cert', filename: `${cert.domain}.crt`, color: 'oklch(74% 0.20 196)' },
          { label: 'Private Key', value: cert.key, key: 'modal-key', filename: `${cert.domain}.key`, color: 'oklch(78% 0.18 300)' },
        ].map(({ label, value, key, filename, color }) => (
          <div key={key} className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <span
                className="text-xs font-semibold uppercase tracking-wider"
                style={{ color: 'oklch(50% 0.02 265)' }}
              >
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
              style={{
                background: 'oklch(13% 0.02 265)',
                border: '1px solid oklch(22% 0.03 265 / 0.6)',
                color,
              }}
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
