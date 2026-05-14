import { useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getCertApi, initiateSslApi, verifySslApi, generateSslApi, deleteCertApi } from '../api/ssl'
import { getApiError } from '../api/errors'
import { useCooldown } from '../hooks/useCooldown'
import { ChallengeType } from '../types/ssl'
import type { CertStatus, IssuedCertificate } from '../types/ssl'
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
  Zap,
} from 'lucide-react'

interface CertModal extends IssuedCertificate {
  certName: string
}

function daysUntil(isoDate?: string): number | null {
  if (!isoDate) return null
  return Math.floor((new Date(isoDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
}

function fmt(isoDate?: string): string {
  if (!isoDate) return '—'
  return new Date(isoDate).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function certLifetimePct(issuedAt?: string, expiryDate?: string): number | null {
  if (!issuedAt || !expiryDate) return null
  const start = new Date(issuedAt).getTime()
  const end   = new Date(expiryDate).getTime()
  const now   = Date.now()
  if (end <= start) return null
  return Math.min(100, Math.max(0, Math.round(((now - start) / (end - start)) * 100)))
}

export default function CertDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [certModal, setCertModal] = useState<CertModal | null>(null)

  const initiateCD = useCooldown(45_000)
  const recheckCD  = useCooldown(60_000)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['cert', id],
    queryFn: () => getCertApi(id!),
    enabled: !!id,
  })

  const cert = data?.data

  const initiateMutation = useMutation({
    mutationFn: (certName: string) => initiateSslApi(certName, true),
    onSettled: () => initiateCD.start(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cert', id] })
      qc.invalidateQueries({ queryKey: ['domains'] })
    },
  })

  const verifyMutation = useMutation({
    mutationFn: ({ certName, challengeType }: { certName: string; challengeType: ChallengeType }) =>
      verifySslApi(certName, challengeType),
    onSettled: () => recheckCD.start(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cert', id] })
      qc.invalidateQueries({ queryKey: ['domains'] })
    },
  })

  const generateMutation = useMutation({
    mutationFn: (certName: string) => generateSslApi(certName),
    onSuccess: (res) => {
      setCertModal({ certName: cert!.certName, ...res.data })
      qc.invalidateQueries({ queryKey: ['cert', id] })
      qc.invalidateQueries({ queryKey: ['domains'] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteCertApi(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['domains'] })
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

  if (isError || !cert) {
    return (
      <main className="flex-1 p-5 lg:p-8 max-w-5xl w-full mx-auto">
        <div className="alert alert-error mt-8">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>Certificate not found or you do not have access.</span>
        </div>
        <button onClick={() => navigate('/certificates')} className="btn btn-ghost btn-sm mt-4 gap-2">
          <ArrowLeft className="w-4 h-4" /> Back to Certificates
        </button>
      </main>
    )
  }

  const days           = daysUntil(cert.expiryDate)
  const isExpiringSoon = days !== null && days >= 0 && days <= 30
  const hasExpired     = days !== null && days < 0
  const lifetimePct    = certLifetimePct(cert.issuedAt, cert.expiryDate)

  const daysColor = hasExpired
    ? 'var(--c-error)'
    : isExpiringSoon
    ? 'var(--c-warning)'
    : 'var(--c-success)'

  return (
    <main className="flex-1 p-5 lg:p-8 max-w-5xl w-full mx-auto space-y-5">

      {/* Header */}
      <div className="pt-1">
        <Link to="/certificates" className="flex items-center gap-1.5 text-sm mb-4" style={{ color: 'var(--c-text-2)' }}>
          <ArrowLeft className="w-4 h-4" /> Certificates
        </Link>
        <div className="flex items-center justify-between gap-3 flex-wrap w-full">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold font-mono" style={{ color: 'var(--c-text-1)' }}>
              {cert.certName}
            </h1>
            <StatusBadge status={cert.status} expiring={isExpiringSoon} />
            <span className="badge badge-sm badge-ghost font-mono">{cert.certType}</span>
            {cert.coveredByWildcardId && (
              <span className="badge badge-sm gap-1" style={{ background: 'var(--c-primary-soft)', color: 'var(--c-primary)', border: '1px solid var(--c-primary-mid)' }}>
                <Zap className="w-3 h-3" /> via wildcard
              </span>
            )}
          </div>
          <button
            onClick={() => {
              if (window.confirm(`Delete certificate for ${cert.certName}?`)) {
                deleteMutation.mutate(id!)
              }
            }}
            disabled={deleteMutation.isPending}
            className="btn btn-ghost btn-sm text-error gap-2"
          >
            {deleteMutation.isPending
              ? <span className="loading loading-spinner loading-xs" />
              : <Trash2 className="w-4 h-4" />}
            Delete
          </button>
        </div>
        <p className="text-sm mt-1" style={{ color: 'var(--c-text-2)' }}>
          Certificate details and management
        </p>
      </div>

      {/* Info grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="col-span-2 rounded-2xl p-5 flex flex-col gap-3" style={{ background: 'var(--c-card)', border: '1px solid var(--c-border)' }}>
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--c-text-3)' }}>Days Remaining</p>
            <Clock className="w-4 h-4" style={{ color: 'var(--c-text-3)' }} />
          </div>
          <p className="text-5xl font-bold leading-none" style={{ color: daysColor }}>
            {days === null ? '—' : days < 0 ? 'Exp.' : days}
          </p>
          {lifetimePct !== null && !hasExpired && (
            <div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--c-surface-2)' }}>
                <div className="h-full rounded-full transition-all" style={{ width: `${lifetimePct}%`, background: daysColor }} />
              </div>
              <p className="text-xs mt-1.5" style={{ color: 'var(--c-text-3)' }}>{lifetimePct}% of cert lifetime used</p>
            </div>
          )}
          {hasExpired && <p className="text-xs" style={{ color: 'var(--c-error)' }}>Certificate has expired</p>}
        </div>

        <div className="rounded-2xl p-5 flex flex-col gap-2" style={{ background: 'var(--c-card)', border: '1px solid var(--c-border)' }}>
          <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--c-text-3)' }}>Issued</p>
          <p className="text-sm font-semibold" style={{ color: 'var(--c-primary)' }}>{fmt(cert.issuedAt)}</p>
        </div>

        <div className="rounded-2xl p-5 flex flex-col gap-2" style={{ background: 'var(--c-card)', border: '1px solid var(--c-border)' }}>
          <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--c-text-3)' }}>Expires</p>
          <p className="text-sm font-semibold" style={{ color: daysColor }}>{fmt(cert.expiryDate)}</p>
        </div>
      </div>

      {/* Renewal failure banner */}
      {cert.renewalError && (
        <div className="rounded-xl p-5" style={{ background: 'var(--c-card)', border: '1px solid oklch(58% 0.22 25 / 0.35)' }}>
          <div className="flex items-start gap-3 mb-4">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'var(--c-error-soft)' }}>
              <AlertCircle className="w-5 h-5" style={{ color: 'var(--c-error)' }} />
            </div>
            <div>
              <p className="font-semibold text-sm" style={{ color: 'var(--c-text-1)' }}>Auto-Renewal Failed</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--c-text-2)' }}>Manual action required.</p>
            </div>
          </div>
          <div className="rounded-lg p-3 mb-4 font-mono text-xs break-all" style={{ background: 'var(--c-code-bg)', border: '1px solid var(--c-border)', color: 'var(--c-error)' }}>
            {cert.renewalError}
          </div>
          <button
            onClick={() => initiateMutation.mutate(cert.certName)}
            disabled={initiateMutation.isPending || initiateCD.isCooling}
            className="btn btn-sm gap-2"
            style={{ background: 'var(--c-error-soft)', borderColor: 'oklch(58% 0.22 25 / 0.35)', color: 'var(--c-error)' }}
          >
            {initiateMutation.isPending ? <span className="loading loading-spinner loading-xs" /> : <RotateCcw className="w-3.5 h-3.5" />}
            {initiateCD.isCooling ? `Wait ${initiateCD.secondsLeft}s` : 'Trigger Manual Renewal'}
          </button>
        </div>
      )}

      {/* Renewing — auto-renewal scheduled (no error yet) */}
      {cert.status === 'renewing' && !cert.renewalError && (
        <div className="rounded-xl px-4 py-3 flex items-start gap-2.5" style={{ background: 'var(--c-info-soft)', border: '1px solid oklch(62% 0.18 230 / 0.35)' }}>
          <RefreshCw className="w-4 h-4 shrink-0 mt-0.5 animate-spin" style={{ color: 'var(--c-info)' }} />
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--c-text-1)' }}>Auto-Renewal In Progress</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--c-text-2)' }}>
              The daemon has detected this certificate is expiring soon and is renewing it automatically.
              {cert.renewalNextRetryAt && (
                <> Next attempt scheduled for{' '}
                  <span className="font-semibold">{new Date(cert.renewalNextRetryAt).toLocaleString()}</span>.
                </>
              )}
            </p>
          </div>
        </div>
      )}

      {/* Via wildcard info */}
      {cert.coveredByWildcardId && (
        <div className="rounded-xl px-4 py-3 flex items-center gap-2.5" style={{ background: 'var(--c-primary-soft)', border: '1px solid var(--c-primary-mid)' }}>
          <Zap className="w-4 h-4 shrink-0" style={{ color: 'var(--c-primary)' }} />
          <p className="text-xs" style={{ color: 'var(--c-primary)' }}>
            This certificate uses the wildcard cert. It shares the same PEM/key and renews with it.
          </p>
        </div>
      )}

      {/* Challenge card */}
      {cert.status === 'pending_challenge' && (
        <div className="rounded-2xl" style={{ background: 'var(--c-card)', border: '1px solid oklch(72% 0.19 80 / 0.35)' }}>
          <div className="p-6">
            <div className="flex items-start gap-3 mb-5">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'var(--c-warning-soft)' }}>
                <AlertTriangle className="w-5 h-5" style={{ color: 'var(--c-warning)' }} />
              </div>
              <div>
                <p className="font-semibold" style={{ color: 'var(--c-text-1)' }}>Prove Domain Ownership</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--c-text-2)' }}>
                  Complete <strong>any one</strong> of the available challenges below to verify you control{' '}
                  <span className="font-mono font-semibold">{cert.certName}</span>.
                </p>
              </div>
            </div>

            <div className="space-y-4">
              {/* DNS-01 */}
              {cert.txtRecordName && cert.txtRecordValue && (() => {
                const relLabel = (() => {
                  const domain = cert.certName.startsWith('*.') ? cert.certName.slice(2) : cert.certName
                  const root   = domain.split('.').slice(-2).join('.')
                  return cert.txtRecordName.endsWith(`.${root}`) ? cert.txtRecordName.slice(0, -(root.length + 1)) : cert.txtRecordName
                })()
                return (
                  <div className="rounded-xl p-4" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
                    <div className="flex items-center gap-2 mb-3">
                      <span className="badge badge-sm badge-ghost font-mono">{ChallengeType.DNS_01}</span>
                      <span className="text-xs font-semibold" style={{ color: 'var(--c-text-2)' }}>DNS TXT Record</span>
                    </div>
                    <ol className="space-y-1.5 mb-3 text-xs" style={{ color: 'var(--c-text-2)' }}>
                      <li className="flex gap-2"><span className="font-bold shrink-0" style={{ color: 'var(--c-primary)' }}>1.</span>Log in to your DNS provider</li>
                      <li className="flex gap-2"><span className="font-bold shrink-0" style={{ color: 'var(--c-primary)' }}>2.</span>Create a new <span className="font-mono font-semibold">TXT</span> record with the Name and Value below</li>
                      <li className="flex gap-2"><span className="font-bold shrink-0" style={{ color: 'var(--c-primary)' }}>3.</span>Wait 1–5 minutes for DNS to propagate, then click Verify</li>
                    </ol>
                    <div className="rounded-xl p-4 space-y-4 font-mono text-sm mb-3" style={{ background: 'var(--c-card)', border: '1px solid var(--c-border)' }}>
                      <div className="flex items-center justify-between">
                        <span className="text-xs uppercase tracking-wider" style={{ color: 'var(--c-text-3)' }}>Record Type</span>
                        <span className="badge badge-neutral font-mono text-xs">TXT</span>
                      </div>
                      {([
                        { label: 'Name',  value: cert.txtRecordName,  key: 'txt-name',  color: 'var(--c-info)'   },
                        { label: 'Value', value: cert.txtRecordValue, key: 'txt-value', color: 'var(--c-purple)' },
                      ] as const).map(({ label, value, key, color }) => (
                        <div key={key} className="space-y-1.5">
                          <span className="text-xs uppercase tracking-wider" style={{ color: 'var(--c-text-3)' }}>{label}</span>
                          <div className="flex items-start gap-2">
                            <span className="flex-1 break-all" style={{ color }}>{value}</span>
                            <button onClick={() => handleCopy(value, key)} className="btn btn-ghost btn-xs btn-square shrink-0">
                              {copiedKey === key ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" style={{ color: 'var(--c-text-2)' }} />}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs mb-3" style={{ color: 'var(--c-text-3)' }}>
                      If your provider auto-appends your root domain, use{' '}
                      <span className="font-mono font-semibold">{relLabel}</span> instead of the full FQDN.
                    </p>
                    <div className="flex justify-end">
                      <button
                        onClick={() => verifyMutation.mutate({ certName: cert.certName, challengeType: ChallengeType.DNS_01 })}
                        disabled={verifyMutation.isPending || recheckCD.isCooling}
                        className="btn btn-warning btn-sm gap-2"
                      >
                        {verifyMutation.isPending
                          ? <><span className="loading loading-spinner loading-xs" /> Verifying…</>
                          : recheckCD.isCooling
                          ? <><RefreshCw className="w-3.5 h-3.5" /> Wait {recheckCD.secondsLeft}s</>
                          : <><ShieldCheck className="w-3.5 h-3.5" /> Verify with dns-01</>}
                      </button>
                    </div>
                  </div>
                )
              })()}

              {/* HTTP-01 */}
              {cert.httpChallengeToken && cert.httpChallengeKeyAuth && (
                <div className="rounded-xl p-4" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="badge badge-sm badge-ghost font-mono">{ChallengeType.HTTP_01}</span>
                    <span className="text-xs font-semibold" style={{ color: 'var(--c-text-2)' }}>HTTP File Challenge</span>
                  </div>
                  <ol className="space-y-1.5 mb-3 text-xs" style={{ color: 'var(--c-text-2)' }}>
                    <li className="flex gap-2"><span className="font-bold shrink-0" style={{ color: 'var(--c-primary)' }}>1.</span>Create <span className="font-mono">/.well-known/acme-challenge/</span> in your document root</li>
                    <li className="flex gap-2"><span className="font-bold shrink-0" style={{ color: 'var(--c-primary)' }}>2.</span>Create file <span className="font-mono font-semibold">{cert.httpChallengeToken}</span> (no extension) with the File Content below</li>
                    <li className="flex gap-2"><span className="font-bold shrink-0" style={{ color: 'var(--c-primary)' }}>3.</span>Verify it's reachable over plain HTTP (port 80, not HTTPS)</li>
                    <li className="flex gap-2"><span className="font-bold shrink-0" style={{ color: 'var(--c-primary)' }}>4.</span>Click Verify</li>
                  </ol>
                  <div className="rounded-xl p-4 space-y-4 font-mono text-sm mb-3" style={{ background: 'var(--c-card)', border: '1px solid var(--c-border)' }}>
                    {([
                      { label: 'Challenge URL', value: `http://${cert.certName}/.well-known/acme-challenge/${cert.httpChallengeToken}`, key: 'http-url',     color: 'var(--c-info)'   },
                      { label: 'File Content',  value: cert.httpChallengeKeyAuth,                                                       key: 'http-content', color: 'var(--c-purple)' },
                    ] as const).map(({ label, value, key, color }) => (
                      <div key={key} className="space-y-1.5">
                        <span className="text-xs uppercase tracking-wider" style={{ color: 'var(--c-text-3)' }}>{label}</span>
                        <div className="flex items-start gap-2">
                          <span className="flex-1 break-all" style={{ color }}>{value}</span>
                          <button onClick={() => handleCopy(value, key)} className="btn btn-ghost btn-xs btn-square shrink-0">
                            {copiedKey === key ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" style={{ color: 'var(--c-text-2)' }} />}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs mb-3" style={{ color: 'var(--c-text-3)' }}>
                    File must be plain text. HTTP→HTTPS redirects cause verification to fail.
                  </p>
                  <div className="flex justify-end">
                    <button
                      onClick={() => verifyMutation.mutate({ certName: cert.certName, challengeType: ChallengeType.HTTP_01 })}
                      disabled={verifyMutation.isPending || recheckCD.isCooling}
                      className="btn btn-warning btn-sm gap-2"
                    >
                      {verifyMutation.isPending
                        ? <><span className="loading loading-spinner loading-xs" /> Verifying…</>
                        : recheckCD.isCooling
                        ? <><RefreshCw className="w-3.5 h-3.5" /> Wait {recheckCD.secondsLeft}s</>
                        : <><ShieldCheck className="w-3.5 h-3.5" /> Verify with http-01</>}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {verifyMutation.isError && (
              <div className="alert alert-error mt-3 text-sm">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{getApiError(verifyMutation.error, 'Verification failed.')}</span>
              </div>
            )}

            <div className="mt-4">
              <button
                onClick={() => initiateMutation.mutate(cert.certName)}
                disabled={initiateMutation.isPending || initiateCD.isCooling}
                className="btn btn-ghost btn-sm gap-2"
              >
                {initiateMutation.isPending ? <span className="loading loading-spinner loading-xs" /> : <RotateCcw className="w-3.5 h-3.5" />}
                {initiateCD.isCooling ? `Wait ${initiateCD.secondsLeft}s` : 'Re-initiate Order'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Challenge verified — ready to generate */}
      {cert.status === 'challenge_verified' && (
        <div className="rounded-2xl" style={{ background: 'var(--c-card)', border: '1px solid oklch(62% 0.18 158 / 0.35)' }}>
          <div className="p-6">
            <div className="flex items-start gap-3 mb-5">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'var(--c-success-soft)' }}>
                <ShieldCheck className="w-5 h-5" style={{ color: 'var(--c-success)' }} />
              </div>
              <div>
                <p className="font-semibold" style={{ color: 'var(--c-text-1)' }}>Ownership Verified</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--c-text-2)' }}>
                  Let's Encrypt confirmed you control this domain. Generate the certificate to complete issuance.
                </p>
              </div>
            </div>
            <div className="rounded-xl px-4 py-3 mb-4 flex items-start gap-2.5" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: 'var(--c-text-3)' }} />
              <p className="text-xs" style={{ color: 'var(--c-text-2)' }}>
                The private key is shown <strong>only once</strong> — save it immediately after generation.
              </p>
            </div>
            {generateMutation.isError && (
              <div className="alert alert-error mb-4 text-sm">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{getApiError(generateMutation.error, 'Certificate generation failed.')}</span>
              </div>
            )}
            <div className="flex justify-end">
              <button onClick={() => generateMutation.mutate(cert.certName)} disabled={generateMutation.isPending} className="btn btn-primary gap-2">
                {generateMutation.isPending
                  ? <><span className="loading loading-spinner loading-sm" /> Generating…</>
                  : <><ShieldCheck className="w-4 h-4" /> Generate Certificate</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Active — PEM display */}
      {cert.status === 'active' && cert.certPem && (
        <>
          <div className="rounded-2xl" style={{ background: 'var(--c-card)', border: '1px solid var(--c-primary-mid)' }}>
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'var(--c-success-soft)' }}>
                    <ShieldCheck className="w-5 h-5" style={{ color: 'var(--c-success)' }} />
                  </div>
                  <div>
                    <p className="font-semibold" style={{ color: 'var(--c-text-1)' }}>Certificate</p>
                    <p className="text-xs" style={{ color: 'var(--c-text-2)' }}>PEM format</p>
                  </div>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => handleCopy(cert.certPem!, 'cert-pem')} className="btn btn-ghost btn-xs gap-1.5">
                    {copiedKey === 'cert-pem' ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedKey === 'cert-pem' ? 'Copied' : 'Copy'}
                  </button>
                  <button onClick={() => handleDownload(cert.certPem!, `${cert.certName}.crt`)} className="btn btn-ghost btn-xs gap-1.5">
                    <Download className="w-3.5 h-3.5" /> Download
                  </button>
                </div>
              </div>
              <div className="rounded-xl p-4 font-mono text-xs overflow-x-auto" style={{ background: 'var(--c-code-bg)', border: '1px solid var(--c-border)', color: 'var(--c-info)' }}>
                <pre className="whitespace-pre-wrap break-all">
                  {cert.certPem.trim().split('\n').slice(0, 6).join('\n')}
                  {cert.certPem.trim().split('\n').length > 6 && '\n…'}
                </pre>
              </div>
            </div>
          </div>

          <div className="rounded-2xl mt-4" style={{ background: 'var(--c-card)', border: '1px solid var(--c-border)' }}>
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'var(--c-success-soft)' }}>
                    <Key className="w-5 h-5" style={{ color: 'var(--c-success)' }} />
                  </div>
                  <div>
                    <p className="font-semibold" style={{ color: 'var(--c-text-1)' }}>Private Key</p>
                    <p className="text-xs" style={{ color: 'var(--c-text-2)' }}>PEM format</p>
                  </div>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => cert.keyPem && handleCopy(cert.keyPem, 'key-pem')} disabled={!cert.keyPem} className="btn btn-ghost btn-xs gap-1.5">
                    {copiedKey === 'key-pem' ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedKey === 'key-pem' ? 'Copied' : 'Copy'}
                  </button>
                  <button onClick={() => cert.keyPem && handleDownload(cert.keyPem, `${cert.certName}.key`)} disabled={!cert.keyPem} className="btn btn-ghost btn-xs gap-1.5">
                    <Download className="w-3.5 h-3.5" /> Download
                  </button>
                </div>
              </div>
              <div className="rounded-xl p-4 font-mono text-xs overflow-x-auto" style={{ background: 'var(--c-code-bg)', border: '1px solid var(--c-border)', color: 'var(--c-info)' }}>
                <pre className="whitespace-pre-wrap break-all">
                  {cert.keyPem ? (
                    <>
                      {cert.keyPem.trim().split('\n').slice(0, 6).join('\n')}
                      {cert.keyPem.trim().split('\n').length > 6 && '\n…'}
                    </>
                  ) : (
                    'Private key not available (only shown once during issuance)'
                  )}
                </pre>
              </div>
            </div>
          </div>
        </>
      )}

      {cert.status === 'active' && (
        <InstallGuide certName={cert.certName} />
      )}

      {/* Failed / expired actions */}
      {(cert.status === 'failed' || (cert.status === 'expired' && !cert.renewalError)) && (
        <div className="rounded-2xl" style={{ background: 'var(--c-card)', border: '1px solid var(--c-border)' }}>
          <div className="p-6">
            <p className="font-semibold mb-1" style={{ color: 'var(--c-text-1)' }}>
              {cert.status === 'failed' ? 'Certificate Failed' : 'Certificate Expired'}
            </p>
            <p className="text-sm mb-4" style={{ color: 'var(--c-text-2)' }}>
              {cert.status === 'failed'
                ? 'Verification failed. Retry to start a fresh ACME challenge.'
                : 'Certificate has expired. Renew to begin a new issuance flow.'}
            </p>
            <button
              onClick={() => initiateMutation.mutate(cert.certName)}
              disabled={initiateMutation.isPending || initiateCD.isCooling}
              className="btn btn-primary btn-sm gap-2"
            >
              {initiateMutation.isPending ? <span className="loading loading-spinner loading-xs" /> : <RotateCcw className="w-3.5 h-3.5" />}
              {initiateCD.isCooling ? `Wait ${initiateCD.secondsLeft}s` : cert.status === 'failed' ? 'Retry Issuance' : 'Renew Certificate'}
            </button>
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

function StatusBadge({ status, expiring }: { status: CertStatus; expiring?: boolean }) {
  if (status === 'active' && expiring) {
    return <span className="badge badge-warning gap-1"><AlertTriangle className="w-3 h-3" />Expiring Soon</span>
  }
  const map: Record<CertStatus, { label: string; cls: string }> = {
    active:             { label: 'Active',            cls: 'badge-success' },
    renewing:           { label: 'Renewing',          cls: 'badge-info'    },
    pending:            { label: 'Pending',           cls: 'badge-neutral' },
    pending_challenge:  { label: 'Challenge Pending', cls: 'badge-warning' },
    challenge_verified: { label: 'Verified',          cls: 'badge-info'    },
    expired:            { label: 'Expired',           cls: 'badge-error'   },
    failed:             { label: 'Failed',            cls: 'badge-error'   },
  }
  const { label, cls } = map[status]
  return <span className={`badge badge-sm ${cls}`}>{label}</span>
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
      <div className="modal-box max-w-2xl" style={{ background: 'var(--c-card)', border: '1px solid var(--c-primary-mid)' }}>
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'var(--c-success-soft)' }}>
              <ShieldCheck className="w-5 h-5" style={{ color: 'var(--c-success)' }} />
            </div>
            <div>
              <h3 className="font-bold text-lg leading-none" style={{ color: 'var(--c-text-1)' }}>Certificate Issued</h3>
              <p className="text-xs mt-1 font-mono" style={{ color: 'var(--c-info)' }}>{cert.certName}</p>
            </div>
          </div>
          <button onClick={onClose} className="btn btn-ghost btn-sm btn-square"><X className="w-4 h-4" /></button>
        </div>
        <p className="text-sm mb-5" style={{ color: 'var(--c-text-2)' }}>Save both files — the private key is shown only once.</p>
        {[
          { label: 'Certificate', value: cert.cert, key: 'modal-cert', filename: `${cert.certName}.crt`, color: 'var(--c-info)'   },
          { label: 'Private Key', value: cert.key,  key: 'modal-key',  filename: `${cert.certName}.key`, color: 'var(--c-purple)' },
        ].map(({ label, value, key, filename, color }) => (
          <div key={key} className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--c-text-2)' }}>{label}</span>
              <div className="flex gap-1">
                <button onClick={() => onCopy(value, key)} className="btn btn-ghost btn-xs gap-1.5">
                  {copiedKey === key ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedKey === key ? 'Copied' : 'Copy'}
                </button>
                <button onClick={() => onDownload(value, filename)} className="btn btn-ghost btn-xs gap-1.5">
                  <Download className="w-3.5 h-3.5" /> Download
                </button>
              </div>
            </div>
            <div className="rounded-xl p-4 font-mono text-xs overflow-x-auto" style={{ background: 'var(--c-code-bg)', border: '1px solid var(--c-border)', color }}>
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

function buildConfigs(certName: string): Record<Platform, { label: string; filename: string; code: string; note?: string }> {
  const crt = `/etc/ssl/certs/${certName}.crt`
  const key = `/etc/ssl/private/${certName}.key`
  const pem = `/etc/ssl/private/${certName}.pem`

  return {
    nginx: {
      label: 'Nginx', filename: 'nginx.conf',
      code: `server {
    listen 443 ssl;
    server_name ${certName};

    ssl_certificate     ${crt};
    ssl_certificate_key ${key};
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;

    # ... your location blocks
}

server {
    listen 80;
    server_name ${certName};
    return 301 https://$host$request_uri;
}`,
    },
    apache: {
      label: 'Apache', filename: 'vhost.conf',
      code: `<VirtualHost *:443>
    ServerName ${certName}
    SSLEngine on
    SSLCertificateFile    ${crt}
    SSLCertificateKeyFile ${key}
    # ... your directory config
</VirtualHost>

<VirtualHost *:80>
    ServerName ${certName}
    Redirect permanent / https://${certName}/
</VirtualHost>`,
    },
    caddy: {
      label: 'Caddy', filename: 'Caddyfile',
      code: `${certName} {
    tls ${crt} ${key}
    # ... your directives
}`,
    },
    nodejs: {
      label: 'Node.js', filename: 'server.js',
      code: `import https from 'https'
import fs from 'fs'

const server = https.createServer({
  cert: fs.readFileSync('${crt}'),
  key:  fs.readFileSync('${key}'),
}, app)

server.listen(443)`,
    },
    haproxy: {
      label: 'HAProxy', filename: 'haproxy.cfg',
      note: `HAProxy needs cert + key combined:\n  cat ${crt} ${key} > ${pem}`,
      code: `frontend https_front
    bind *:443 ssl crt ${pem}
    default_backend app_servers

frontend http_front
    bind *:80
    redirect scheme https code 301`,
    },
  }
}

function InstallGuide({ certName }: { certName: string }) {
  const [isOpen, setIsOpen]     = useState(false)
  const [platform, setPlatform] = useState<Platform>('nginx')
  const [copied, setCopied]     = useState(false)

  const configs = buildConfigs(certName)
  const current = configs[platform]

  const handleCopy = async () => {
    await navigator.clipboard.writeText(current.code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--c-border)' }}>
      <button
        className="w-full flex items-center justify-between px-5 py-3.5 text-left"
        style={{ background: 'var(--c-surface)' }}
        onClick={() => setIsOpen(o => !o)}
      >
        <div className="flex items-center gap-2">
          <BookOpen className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--c-text-3)' }} />
          <span className="text-xs font-medium" style={{ color: 'var(--c-text-2)' }}>Installation Guide</span>
          <span className="text-xs hidden sm:inline" style={{ color: 'var(--c-text-3)' }}>— Nginx, Apache, Caddy…</span>
        </div>
        <ChevronDown className="w-3.5 h-3.5 shrink-0 transition-transform" style={{ color: 'var(--c-text-3)', transform: isOpen ? 'rotate(180deg)' : 'none' }} />
      </button>

      {isOpen && (
        <div className="p-5" style={{ background: 'var(--c-card)' }}>
          <p className="text-xs mb-4" style={{ color: 'var(--c-text-3)' }}>
            Upload <span className="font-mono">.crt</span> and <span className="font-mono">.key</span> to your server, then apply the snippet for your platform.
          </p>
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
          {current.note && (
            <div className="rounded-lg px-3 py-2 mb-3 font-mono text-xs whitespace-pre" style={{ background: 'var(--c-surface)', color: 'var(--c-text-2)', border: '1px solid var(--c-border)' }}>
              {current.note}
            </div>
          )}
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--c-border)' }}>
            <div className="flex items-center justify-between px-4 py-2" style={{ background: 'var(--c-surface-2)', borderBottom: '1px solid var(--c-border)' }}>
              <span className="text-xs font-mono" style={{ color: 'var(--c-text-3)' }}>{current.filename}</span>
              <button onClick={handleCopy} className="btn btn-ghost btn-xs gap-1.5">
                {copied ? <><Check className="w-3 h-3 text-success" /> Copied</> : <><Copy className="w-3 h-3" /> Copy</>}
              </button>
            </div>
            <pre className="p-4 text-xs overflow-x-auto leading-relaxed" style={{ background: 'var(--c-code-bg)', color: 'var(--c-text-2)' }}>
              {current.code}
            </pre>
          </div>
          <p className="text-xs mt-3" style={{ color: 'var(--c-text-3)' }}>
            After applying, reload your server and test with <span className="font-mono">curl -I https://{certName}</span>
          </p>
        </div>
      )}
    </div>
  )
}
