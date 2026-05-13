import { useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getDomainApi, initiateSslApi, verifySslApi, generateSslApi, deleteDomainApi } from '../api/ssl'
import { getApiError } from '../api/errors'
import { useCooldown } from '../hooks/useCooldown'
import { ChallengeType, DomainType } from '../types/ssl'
import type { DomainDetail, DomainStatus, IssuedCertificate } from '../types/ssl'
import {
  ArrowLeft,
  ShieldCheck,
  AlertTriangle,
  AlertCircle,
  Copy,
  Check,
  Download,
  Key,
  RotateCcw,
  RefreshCw,
  Clock,
  X,
  Trash2,
  BookOpen,
  ChevronDown,
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

  const verifyMutation = useMutation({
    mutationFn: (d: string) => verifySslApi(d),
    onSettled: () => recheckCD.start(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['domain', id] })
      qc.invalidateQueries({ queryKey: ['certificates'] })
    },
  })

  const generateMutation = useMutation({
    mutationFn: (d: string) => generateSslApi(d),
    onSuccess: (res) => {
      setCertModal({ domain: domain!.domainName, ...res.data })
      qc.invalidateQueries({ queryKey: ['domain', id] })
      qc.invalidateQueries({ queryKey: ['certificates'] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteDomainApi(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['certificates'] })
      navigate('/certificates')
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
        <div className="flex items-center justify-between gap-3 flex-wrap w-full">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold font-mono" style={{ color: 'var(--c-text-1)' }}>
              {domain.domainName}
            </h1>
            <StatusBadge status={domain.status} expiring={isExpiringSoon} />
            <span className="badge badge-sm badge-ghost font-mono">
              {domain.domainType === DomainType.WILDCARD ? 'wildcard' : 'single'}
            </span>
          </div>
          <button
            onClick={() => {
              if (window.confirm(`Are you sure you want to delete ${domain.domainName}?`)) {
                deleteMutation.mutate(id!)
              }
            }}
            disabled={deleteMutation.isPending}
            className="btn btn-ghost btn-sm text-error gap-2"
          >
            {deleteMutation.isPending ? (
              <span className="loading loading-spinner loading-xs" />
            ) : (
              <Trash2 className="w-4 h-4" />
            )}
            Delete
          </button>
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

      {/* ── Challenge Card (dns-01 or http-01) ── */}
      {domain.status === 'pending_challenge' && (
        <div
          className="rounded-2xl"
          style={{ background: 'var(--c-card)', border: '1px solid oklch(72% 0.19 80 / 0.35)' }}
        >
          <div className="p-6">
            {/* Header */}
            <div className="flex items-start gap-3 mb-5">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: 'var(--c-warning-soft)' }}
              >
                <AlertTriangle className="w-5 h-5" style={{ color: 'var(--c-warning)' }} />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <p className="font-semibold" style={{ color: 'var(--c-text-1)' }}>
                    {domain.challengeType === ChallengeType.HTTP_01
                      ? 'HTTP Challenge Required'
                      : 'DNS Challenge Required'}
                  </p>
                  {domain.challengeType && (
                    <span className="badge badge-sm badge-ghost font-mono">{domain.challengeType}</span>
                  )}
                </div>
                <p className="text-xs" style={{ color: 'var(--c-text-2)' }}>
                  {domain.challengeType === ChallengeType.HTTP_01
                    ? "Prove you control this domain by serving a file on your web server."
                    : "Prove you control this domain by adding a TXT record to your DNS."}
                </p>
              </div>
            </div>

            {/* DNS-01: numbered guide + fields */}
            {domain.challengeType !== ChallengeType.HTTP_01 && (
              <>
                <ol className="space-y-1.5 mb-4 text-xs" style={{ color: 'var(--c-text-2)' }}>
                  <li className="flex gap-2">
                    <span className="font-bold shrink-0" style={{ color: 'var(--c-primary)' }}>1.</span>
                    Log in to your DNS provider (Cloudflare, Route 53, Namecheap, etc.)
                  </li>
                  <li className="flex gap-2">
                    <span className="font-bold shrink-0" style={{ color: 'var(--c-primary)' }}>2.</span>
                    Create a new <span className="font-mono font-semibold">TXT</span> record using the Name and Value below
                  </li>
                  <li className="flex gap-2">
                    <span className="font-bold shrink-0" style={{ color: 'var(--c-primary)' }}>3.</span>
                    Wait 1–5 minutes for DNS to propagate, then click Verify
                  </li>
                </ol>
                <div
                  className="rounded-xl p-4 space-y-4 font-mono text-sm"
                  style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs uppercase tracking-wider" style={{ color: 'var(--c-text-3)' }}>Record Type</span>
                    <span className="badge badge-neutral font-mono text-xs">TXT</span>
                  </div>
                  {[
                    { label: 'Name',  value: domain.txtRecordName  ?? `_acme-challenge.${domain.domainName.startsWith('*.') ? domain.domainName.slice(2) : domain.domainName}`, key: 'txt-name',  color: 'var(--c-info)'   },
                    { label: 'Value', value: domain.txtRecordValue ?? '(not available)',                       key: 'txt-value', color: 'var(--c-purple)' },
                  ].map(({ label, value, key, color }) => (
                    <div key={key} className="space-y-1.5">
                      <span className="text-xs uppercase tracking-wider" style={{ color: 'var(--c-text-3)' }}>{label}</span>
                      <div className="flex items-start gap-2">
                        <span className="flex-1 break-all" style={{ color }}>{value}</span>
                        <button onClick={() => handleCopy(value, key)} className="btn btn-ghost btn-xs btn-square shrink-0">
                          {copiedKey === key
                            ? <Check className="w-3.5 h-3.5 text-success" />
                            : <Copy className="w-3.5 h-3.5" style={{ color: 'var(--c-text-2)' }} />}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-xs mt-3" style={{ color: 'var(--c-text-3)' }}>
                  Some DNS providers require you to enter only the subdomain part of the Name (e.g. <span className="font-mono">_acme-challenge</span> instead of the full FQDN). Check your provider's docs if the record is not being saved.
                </p>
              </>
            )}

            {/* HTTP-01: numbered guide + fields */}
            {domain.challengeType === ChallengeType.HTTP_01 && (
              <>
                <ol className="space-y-1.5 mb-4 text-xs" style={{ color: 'var(--c-text-2)' }}>
                  <li className="flex gap-2">
                    <span className="font-bold shrink-0" style={{ color: 'var(--c-primary)' }}>1.</span>
                    On your web server, create the directory <span className="font-mono">/.well-known/acme-challenge/</span> inside your document root
                  </li>
                  <li className="flex gap-2">
                    <span className="font-bold shrink-0" style={{ color: 'var(--c-primary)' }}>2.</span>
                    Create a file named exactly <span className="font-mono font-semibold">{domain.httpChallengeToken ?? '<token>'}</span> (no file extension) and paste the File Content below into it
                  </li>
                  <li className="flex gap-2">
                    <span className="font-bold shrink-0" style={{ color: 'var(--c-primary)' }}>3.</span>
                    Verify the file is reachable at the Challenge URL over plain HTTP (port 80) — not HTTPS
                  </li>
                  <li className="flex gap-2">
                    <span className="font-bold shrink-0" style={{ color: 'var(--c-primary)' }}>4.</span>
                    Click Verify — Let's Encrypt will fetch the file to confirm ownership
                  </li>
                </ol>
                <div
                  className="rounded-xl p-4 space-y-4 font-mono text-sm"
                  style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}
                >
                  {[
                    {
                      label: 'Challenge URL',
                      value: `http://${domain.domainName}/.well-known/acme-challenge/${domain.httpChallengeToken ?? '(pending)'}`,
                      key: 'http-url',
                      color: 'var(--c-info)',
                    },
                    {
                      label: 'File Content',
                      value: domain.httpChallengeKeyAuth ?? '(not available)',
                      key: 'http-content',
                      color: 'var(--c-purple)',
                    },
                  ].map(({ label, value, key, color }) => (
                    <div key={key} className="space-y-1.5">
                      <span className="text-xs uppercase tracking-wider" style={{ color: 'var(--c-text-3)' }}>{label}</span>
                      <div className="flex items-start gap-2">
                        <span className="flex-1 break-all" style={{ color }}>{value}</span>
                        <button onClick={() => handleCopy(value, key)} className="btn btn-ghost btn-xs btn-square shrink-0">
                          {copiedKey === key
                            ? <Check className="w-3.5 h-3.5 text-success" />
                            : <Copy className="w-3.5 h-3.5" style={{ color: 'var(--c-text-2)' }} />}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-xs mt-3" style={{ color: 'var(--c-text-3)' }}>
                  The file must be served as plain text with no extra content or newlines. Redirects from HTTP → HTTPS will cause verification to fail.
                </p>
              </>
            )}

            {verifyMutation.isError && (
              <div className="alert alert-error mt-3 text-sm">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{getApiError(verifyMutation.error, 'Verification failed. Check that the challenge is correctly set up.')}</span>
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
                onClick={() => verifyMutation.mutate(domain.domainName)}
                disabled={verifyMutation.isPending || recheckCD.isCooling}
                className="btn btn-warning gap-2"
              >
                {verifyMutation.isPending
                  ? <><span className="loading loading-spinner loading-sm" /> Verifying…</>
                  : recheckCD.isCooling
                  ? <><RefreshCw className="w-4 h-4" /> Wait {recheckCD.secondsLeft}s</>
                  : <><ShieldCheck className="w-4 h-4" /> Verify Ownership</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Challenge Verified — ready to generate ── */}
      {domain.status === 'challenge_verified' && (
        <div
          className="rounded-2xl"
          style={{ background: 'var(--c-card)', border: '1px solid oklch(62% 0.18 158 / 0.35)' }}
        >
          <div className="p-6">
            <div className="flex items-start gap-3 mb-5">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: 'var(--c-success-soft)' }}
              >
                <ShieldCheck className="w-5 h-5" style={{ color: 'var(--c-success)' }} />
              </div>
              <div>
                <p className="font-semibold" style={{ color: 'var(--c-text-1)' }}>Ownership Verified</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--c-text-2)' }}>
                  Let's Encrypt confirmed you control this domain. Generate the certificate to complete issuance.
                </p>
              </div>
            </div>

            <div
              className="rounded-xl px-4 py-3 mb-4 flex items-start gap-2.5"
              style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: 'var(--c-text-3)' }} />
              <p className="text-xs" style={{ color: 'var(--c-text-2)' }}>
                Generating creates a private key and CSR, then finalises the order. The private key is shown <strong>only once</strong> — save it immediately after generation.
              </p>
            </div>

            {generateMutation.isError && (
              <div className="alert alert-error mb-4 text-sm">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{getApiError(generateMutation.error, 'Certificate generation failed.')}</span>
              </div>
            )}

            <div className="flex justify-end">
              <button
                onClick={() => generateMutation.mutate(domain.domainName)}
                disabled={generateMutation.isPending}
                className="btn btn-primary gap-2"
              >
                {generateMutation.isPending
                  ? <><span className="loading loading-spinner loading-sm" /> Generating…</>
                  : <><ShieldCheck className="w-4 h-4" /> Generate Certificate</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Stored Certificate (active) ── */}
      {domain.status === 'active' && domain.certPem && (
        <>
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

        <div
          className="rounded-2xl mt-4"
          style={{ background: 'var(--c-card)', border: '1px solid var(--c-border)' }}
        >
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center"
                  style={{ background: 'var(--c-success-soft)' }}
                >
                  <Key className="w-5 h-5" style={{ color: 'var(--c-success)' }} />
                </div>
                <div>
                  <p className="font-semibold" style={{ color: 'var(--c-text-1)' }}>Private Key</p>
                  <p className="text-xs" style={{ color: 'var(--c-text-2)' }}>Private key (PEM)</p>
                </div>
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => domain.keyPem && handleCopy(domain.keyPem, 'key-pem')}
                  className="btn btn-ghost btn-xs gap-1.5"
                  disabled={!domain.keyPem}
                >
                  {copiedKey === 'key-pem'
                    ? <Check className="w-3.5 h-3.5 text-success" />
                    : <Copy className="w-3.5 h-3.5" />}
                  {copiedKey === 'key-pem' ? 'Copied' : 'Copy'}
                </button>
                <button
                  onClick={() => domain.keyPem && handleDownload(domain.keyPem, `${domain.domainName}.key`)}
                  className="btn btn-ghost btn-xs gap-1.5"
                  disabled={!domain.keyPem}
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
                {domain.keyPem ? (
                  <>
                    {domain.keyPem.trim().split('\n').slice(0, 6).join('\n')}
                    {domain.keyPem.trim().split('\n').length > 6 && '\n…'}
                  </>
                ) : (
                  'Private key not available for existing certificates (only shown once during issuance)'
                )}
              </pre>
            </div>
          </div>
        </div>
        </>
      )}

      {/* ── Installation Guide (secondary — collapsible, only when active) ── */}
      {domain.status === 'active' && (
        <InstallGuide domainName={domain.domainName} />
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
    active:             { label: 'Active',            cls: 'badge-success' },
    pending:            { label: 'Pending',           cls: 'badge-neutral' },
    pending_challenge:  { label: 'Challenge Pending', cls: 'badge-warning' },
    challenge_verified: { label: 'Verified',          cls: 'badge-info'    },
    expired:            { label: 'Expired',           cls: 'badge-error'   },
    failed:             { label: 'Failed',            cls: 'badge-error'   },
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

// ── Installation Guide ────────────────────────────────────────────────────────

type Platform = 'nginx' | 'apache' | 'caddy' | 'nodejs' | 'haproxy'

function buildConfigs(domain: string): Record<Platform, { label: string; filename: string; code: string; note?: string }> {
  const crt = `/etc/ssl/certs/${domain}.crt`
  const key = `/etc/ssl/private/${domain}.key`
  const pem = `/etc/ssl/private/${domain}.pem`

  return {
    nginx: {
      label: 'Nginx', filename: 'nginx.conf',
      code:
`server {
    listen 443 ssl;
    server_name ${domain};

    ssl_certificate     ${crt};
    ssl_certificate_key ${key};
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # ... your location blocks
}

server {
    listen 80;
    server_name ${domain};
    return 301 https://$host$request_uri;
}`,
    },
    apache: {
      label: 'Apache', filename: 'vhost.conf',
      code:
`<VirtualHost *:443>
    ServerName ${domain}

    SSLEngine on
    SSLCertificateFile    ${crt}
    SSLCertificateKeyFile ${key}

    # ... your directory config
</VirtualHost>

<VirtualHost *:80>
    ServerName ${domain}
    Redirect permanent / https://${domain}/
</VirtualHost>`,
    },
    caddy: {
      label: 'Caddy', filename: 'Caddyfile',
      code:
`${domain} {
    tls ${crt} ${key}

    # ... your directives
}`,
    },
    nodejs: {
      label: 'Node.js', filename: 'server.js',
      code:
`import https from 'https'
import fs    from 'fs'

const server = https.createServer({
  cert: fs.readFileSync('${crt}'),
  key:  fs.readFileSync('${key}'),
}, app)

server.listen(443)`,
    },
    haproxy: {
      label: 'HAProxy', filename: 'haproxy.cfg',
      note: `HAProxy needs cert + key combined:\n  cat ${crt} ${key} > ${pem}`,
      code:
`frontend https_front
    bind *:443 ssl crt ${pem}
    default_backend app_servers

frontend http_front
    bind *:80
    redirect scheme https code 301`,
    },
  }
}

function InstallGuide({ domainName }: { domainName: string }) {
  const [isOpen, setIsOpen]   = useState(false)
  const [platform, setPlatform] = useState<Platform>('nginx')
  const [copied, setCopied]   = useState(false)

  const configs  = buildConfigs(domainName)
  const current  = configs[platform]

  const handleCopy = async () => {
    await navigator.clipboard.writeText(current.code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--c-border)' }}>

      {/* Toggle header — visually secondary */}
      <button
        className="w-full flex items-center justify-between px-5 py-3.5 text-left transition-colors"
        style={{ background: 'var(--c-surface)' }}
        onClick={() => setIsOpen(o => !o)}
      >
        <div className="flex items-center gap-2">
          <BookOpen className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--c-text-3)' }} />
          <span className="text-xs font-medium" style={{ color: 'var(--c-text-2)' }}>Installation Guide</span>
          <span className="text-xs hidden sm:inline" style={{ color: 'var(--c-text-3)' }}>— configure Nginx, Apache, Caddy…</span>
        </div>
        <ChevronDown
          className="w-3.5 h-3.5 shrink-0 transition-transform"
          style={{ color: 'var(--c-text-3)', transform: isOpen ? 'rotate(180deg)' : 'none' }}
        />
      </button>

      {isOpen && (
        <div className="p-5" style={{ background: 'var(--c-card)' }}>
          <p className="text-xs mb-4" style={{ color: 'var(--c-text-3)' }}>
            Upload your downloaded <span className="font-mono">.crt</span> and <span className="font-mono">.key</span> files to the server, then apply the snippet for your platform.
          </p>

          {/* Platform pills */}
          <div className="flex flex-wrap gap-1.5 mb-4">
            {(Object.keys(configs) as Platform[]).map((key) => (
              <button
                key={key}
                onClick={() => setPlatform(key)}
                className="px-3 py-1 rounded-lg text-xs font-medium transition-all"
                style={
                  platform === key
                    ? { background: 'var(--c-primary-soft)', color: 'var(--c-primary)', border: '1px solid var(--c-primary-mid)' }
                    : { background: 'var(--c-surface)', color: 'var(--c-text-2)', border: '1px solid var(--c-border)' }
                }
              >
                {configs[key].label}
              </button>
            ))}
          </div>

          {/* HAProxy note */}
          {current.note && (
            <div
              className="rounded-lg px-3 py-2 mb-3 font-mono text-xs whitespace-pre"
              style={{ background: 'var(--c-surface)', color: 'var(--c-text-2)', border: '1px solid var(--c-border)' }}
            >
              {current.note}
            </div>
          )}

          {/* Code block */}
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--c-border)' }}>
            <div
              className="flex items-center justify-between px-4 py-2"
              style={{ background: 'var(--c-surface-2)', borderBottom: '1px solid var(--c-border)' }}
            >
              <span className="text-xs font-mono" style={{ color: 'var(--c-text-3)' }}>{current.filename}</span>
              <button onClick={handleCopy} className="btn btn-ghost btn-xs gap-1.5">
                {copied
                  ? <><Check className="w-3 h-3 text-success" /> Copied</>
                  : <><Copy className="w-3 h-3" /> Copy</>}
              </button>
            </div>
            <pre
              className="p-4 text-xs overflow-x-auto leading-relaxed"
              style={{ background: 'var(--c-code-bg)', color: 'var(--c-text-2)' }}
            >
              {current.code}
            </pre>
          </div>

          <p className="text-xs mt-3" style={{ color: 'var(--c-text-3)' }}>
            After applying, reload your server and test with{' '}
            <span className="font-mono">curl -I https://{domainName}</span>
          </p>
        </div>
      )}
    </div>
  )
}
