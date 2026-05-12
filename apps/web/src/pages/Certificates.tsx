import { useState, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getCertificatesApi, initiateSslApi, verifySslApi, recheckSslApi, deleteDomainApi } from '../api/ssl'
import { getApiError } from '../api/errors'
import { useCooldown } from '../hooks/useCooldown'
import type { DomainRecord, DomainStatus, IssuedCertificate } from '../types/ssl'
import {
  Globe,
  ShieldCheck,
  AlertTriangle,
  AlertCircle,
  Copy,
  Check,
  Download,
  RotateCcw,
  Plus,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  X,
  ExternalLink,
  Trash2,
} from 'lucide-react'

interface ChallengeState { domain: string; txtName: string; txtValue: string }
interface CertState extends IssuedCertificate { domain: string }

function isExpiringSoon(expiryDate?: string): boolean {
  if (!expiryDate) return false
  return new Date(expiryDate).getTime() - Date.now() < 30 * 24 * 60 * 60 * 1000
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function Certificates() {
  const qc = useQueryClient()

  const [showForm, setShowForm] = useState(false)
  const [formDomain, setFormDomain] = useState('')
  const [challenge, setChallenge] = useState<ChallengeState | null>(null)
  const [certificate, setCertificate] = useState<CertState | null>(null)
  const [expandedRow, setExpandedRow] = useState<string | null>(null)
  const [modalCert, setModalCert] = useState<CertState | null>(null)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  // Per-domain cooldown tracking (60s verify, 45s initiate)
  const cooldownsRef = useRef<Map<string, number>>(new Map())
  const [, forceRender] = useState(0)

  const startDomainCooldown = useCallback((domain: string, ms: number) => {
    cooldownsRef.current.set(domain, Date.now() + ms)
    forceRender((n) => n + 1)
    setTimeout(() => {
      cooldownsRef.current.delete(domain)
      forceRender((n) => n + 1)
    }, ms)
  }, [])

  const isCooling = useCallback((domain: string) => (cooldownsRef.current.get(domain) ?? 0) > Date.now(), [])
  // const secondsLeft   = useCallback((domain: string) => {
  //   const endsAt = cooldownsRef.current.get(domain) ?? 0
  //   return Math.max(0, Math.ceil((endsAt - Date.now()) / 1000))
  // }, [])

  // Cooldown for the new-certificate flow (verify step uses global verify CD)
  const verifyCD = useCooldown(60_000)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['certificates'],
    queryFn: getCertificatesApi,
  })
  const certs = data?.data.certificates ?? []

  const initiateMutation = useMutation({
    mutationFn: (d: string) => initiateSslApi(d),
    onSettled: (_, __, domain) => startDomainCooldown(domain, 45_000),
    onSuccess: (res, domain) => {
      setChallenge({ domain, txtName: res.data.txtName, txtValue: res.data.txtValue })
      setCertificate(null)
      setShowForm(false)
      setExpandedRow(null)
      qc.invalidateQueries({ queryKey: ['certificates'] })
    },
  })

  const verifyMutation = useMutation({
    mutationFn: (d: string) => verifySslApi(d),
    onSettled: () => verifyCD.start(),
    onSuccess: (res) => {
      setCertificate({ domain: challenge!.domain, ...res.data })
      setChallenge(null)
      qc.invalidateQueries({ queryKey: ['certificates'] })
    },
  })

  const recheckMutation = useMutation({
    mutationFn: (d: string) => recheckSslApi(d),
    onSettled: (_, __, domain) => startDomainCooldown(domain, 60_000),
    onSuccess: (res, domain) => {
      setModalCert({ domain, ...res.data })
      setExpandedRow(null)
      qc.invalidateQueries({ queryKey: ['certificates'] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteDomainApi(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['certificates'] })
    },
  })

  const handleInitiate = (e: React.FormEvent) => {
    e.preventDefault()
    if (isCooling(formDomain)) return
    initiateMutation.mutate(formDomain)
  }
  const handleRetry = (domain: string) => {
    if (isCooling(domain)) return
    initiateMutation.mutate(domain)
  }
  const handleCopy = async (text: string, key: string) => {
    await navigator.clipboard.writeText(text)
    setCopiedKey(key)
    setTimeout(() => setCopiedKey(null), 2000)
  }
  const handleDownload = (content: string, filename: string) => {
    const url = URL.createObjectURL(new Blob([content], { type: 'text/plain' }))
    Object.assign(document.createElement('a'), { href: url, download: filename }).click()
    URL.revokeObjectURL(url)
  }
  const handleReset = () => {
    setShowForm(false); setFormDomain(''); setChallenge(null); setCertificate(null)
    initiateMutation.reset(); verifyMutation.reset()
  }
  const toggleRow = (id: string) => setExpandedRow((p) => (p === id ? null : id))
  const activeFlow = showForm || !!challenge || !!certificate

  return (
    <main className="flex-1 p-5 lg:p-8 max-w-5xl w-full mx-auto space-y-5">

      {/* Header */}
      <div className="pt-1 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--c-text-1)' }}>Certificates</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--c-text-2)' }}>
            Issue, verify, and monitor SSL certificates
          </p>
        </div>
        {!activeFlow && (
          <button onClick={() => setShowForm(true)} className="btn btn-primary btn-sm gap-2 shrink-0">
            <Plus className="w-4 h-4" />
            New Certificate
          </button>
        )}
      </div>

      {/* Issue Form */}
      {showForm && !challenge && !certificate && (
        <div className="rounded-2xl p-6 sm:p-8" style={{ background: 'var(--c-card)', border: '1px solid var(--c-border)' }}>
          <h2 className="text-base font-bold mb-1" style={{ color: 'var(--c-text-1)' }}>Issue New Certificate</h2>
          <p className="text-sm mb-5" style={{ color: 'var(--c-text-2)' }}>
            Enter a domain to begin the DNS-01 ACME challenge
          </p>
          <form onSubmit={handleInitiate}>
            <div className="flex flex-col sm:flex-row gap-3">
              <label className="input input-bordered flex items-center gap-2.5 flex-1" htmlFor="domain-input">
                <Globe className="w-4 h-4 shrink-0" style={{ color: 'var(--c-text-3)' }} />
                <input
                  id="domain-input"
                  type="text"
                  value={formDomain}
                  onChange={(e) => setFormDomain(e.target.value)}
                  className="grow bg-transparent outline-none"
                  placeholder="example.com"
                  required
                />
              </label>
              <div className="flex gap-2">
                <button type="button" onClick={handleReset} className="btn btn-ghost shrink-0">Cancel</button>
                <button type="submit" disabled={initiateMutation.isPending} className="btn btn-primary shrink-0">
                  {initiateMutation.isPending ? <span className="loading loading-spinner" /> : 'Initiate'}
                </button>
              </div>
            </div>
            {initiateMutation.isError && (
              <div className="alert alert-error mt-4 text-sm">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{getApiError(initiateMutation.error, 'Failed to initiate certificate.')}</span>
              </div>
            )}
          </form>
        </div>
      )}

      {/* Challenge Panel */}
      {challenge && (
        <ChallengeCard
          challenge={challenge}
          copiedKey={copiedKey}
          verifyPending={verifyMutation.isPending}
          verifyError={verifyMutation.isError ? getApiError(verifyMutation.error, 'Verification failed. Check DNS propagation.') : null}
          onCopy={handleCopy}
          onVerify={() => verifyMutation.mutate(challenge.domain)}
          onReset={handleReset}
        />
      )}

      {/* Cert Result */}
      {certificate && (
        <CertCard cert={certificate} copiedKey={copiedKey} onCopy={handleCopy} onDownload={handleDownload} onReset={handleReset} resetLabel="Issue another" />
      )}

      {/* Table */}
      <div className="rounded-2xl" style={{ background: 'var(--c-card)', border: '1px solid var(--c-border)' }}>
        <div className="flex items-center justify-between px-6 pt-5 pb-4" style={{ borderBottom: '1px solid var(--c-border)' }}>
          <h2 className="text-sm font-semibold" style={{ color: 'var(--c-text-1)' }}>All Domains</h2>
        </div>

        {isError && (
          <div className="alert alert-error text-sm m-4">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>Failed to load certificates.</span>
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center py-12">
            <span className="loading loading-spinner loading-md" style={{ color: 'var(--c-primary)' }} />
          </div>
        ) : certs.length === 0 ? (
          <div className="text-center py-16" style={{ color: 'var(--c-text-3)' }}>
            <ShieldCheck className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No certificates yet. Issue your first one.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table table-sm">
              <thead>
                <tr style={{ color: 'var(--c-text-3)', fontSize: '0.7rem' }}>
                  <th className="w-6" />
                  <th>Domain</th>
                  <th>Status</th>
                  <th>Issued</th>
                  <th>Expires</th>
                  <th>Quick Actions</th>
                </tr>
              </thead>
              <tbody>
                {certs.map((cert) => (
                  <>
                    <tr key={cert._id} className={`hover ${expandedRow === cert._id ? 'border-b-0' : ''}`}>
                      <td className="pr-0">
                        {cert.status === 'pending_challenge' && (
                          <button onClick={() => toggleRow(cert._id)} className="btn btn-ghost btn-xs btn-square">
                            {expandedRow === cert._id
                              ? <ChevronDown className="w-3.5 h-3.5" style={{ color: 'var(--c-text-3)' }} />
                              : <ChevronRight className="w-3.5 h-3.5" style={{ color: 'var(--c-text-3)' }} />}
                          </button>
                        )}
                      </td>
                      <td>
                        <Link
                          to={`/certificates/${cert._id}`}
                          className="flex items-center gap-1.5 font-mono text-sm hover:underline"
                          style={{ color: 'var(--c-primary)' }}
                        >
                          {cert.domainName}
                          <ExternalLink className="w-3 h-3 opacity-40 shrink-0" />
                        </Link>
                      </td>
                      <td>
                        <div className="flex items-center gap-1.5">
                          <StatusBadge status={cert.status} expiring={isExpiringSoon(cert.expiryDate)} />
                          {cert.renewalError && (
                            <span title={`Auto-renewal failed: ${cert.renewalError}`}>
                              <AlertCircle className="w-3.5 h-3.5" style={{ color: 'var(--c-error)' }} />
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="text-sm" style={{ color: 'var(--c-text-2)' }}>
                        {new Date(cert.createdAt).toLocaleDateString()}
                      </td>
                      <td
                        className="text-sm"
                        style={{ color: isExpiringSoon(cert.expiryDate) ? 'var(--c-warning)' : 'var(--c-text-2)' }}
                      >
                        {cert.expiryDate ? new Date(cert.expiryDate).toLocaleDateString() : '—'}
                      </td>
                      <td>
                        <div className="flex items-center gap-2">
                          <RowActions
                            cert={cert}
                            recheckPending={recheckMutation.isPending && recheckMutation.variables === cert.domainName}
                            retryPending={initiateMutation.isPending && initiateMutation.variables === cert.domainName}
                            onRecheck={() => recheckMutation.mutate(cert.domainName)}
                            onRetry={() => handleRetry(cert.domainName)}
                          />
                          <button
                            onClick={() => {
                              if (window.confirm(`Are you sure you want to delete ${cert.domainName}?`)) {
                                deleteMutation.mutate(cert._id)
                              }
                            }}
                            disabled={deleteMutation.isPending}
                            className="btn btn-ghost btn-xs btn-square text-error"
                            title="Delete Domain"
                          >
                            {deleteMutation.isPending && deleteMutation.variables === cert._id ? (
                              <span className="loading loading-spinner loading-xs" />
                            ) : (
                              <Trash2 className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>

                    {expandedRow === cert._id && cert.status === 'pending_challenge' && (
                      <tr key={`${cert._id}-exp`}>
                        <td colSpan={6} className="pt-0 pb-3 px-4">
                          <ExpandedChallenge
                            cert={cert}
                            copiedKey={copiedKey}
                            recheckPending={recheckMutation.isPending && recheckMutation.variables === cert.domainName}
                            recheckError={
                              recheckMutation.isError && recheckMutation.variables === cert.domainName
                                ? getApiError(recheckMutation.error, 'Verification failed. DNS may not have propagated yet.')
                                : null
                            }
                            onCopy={handleCopy}
                            onRecheck={() => recheckMutation.mutate(cert.domainName)}
                          />
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Cert Modal */}
      {modalCert && (
        <div className="modal modal-open">
          <div className="modal-box max-w-2xl" style={{ background: 'var(--c-card)', border: '1px solid var(--c-success)', borderColor: 'oklch(62% 0.18 158 / 0.3)' }}>
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'var(--c-success-soft)' }}>
                  <ShieldCheck className="w-5 h-5" style={{ color: 'var(--c-success)' }} />
                </div>
                <div>
                  <h3 className="font-bold text-lg leading-none" style={{ color: 'var(--c-text-1)' }}>Certificate Issued</h3>
                  <p className="text-xs mt-1 font-mono" style={{ color: 'var(--c-primary)' }}>{modalCert.domain}</p>
                </div>
              </div>
              <button onClick={() => setModalCert(null)} className="btn btn-ghost btn-sm btn-square">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-sm mb-5" style={{ color: 'var(--c-text-2)' }}>
              Save both files securely — the private key is shown only once.
            </p>
            <CertFiles cert={modalCert.cert} privKey={modalCert.key} domain={modalCert.domain} copiedKey={copiedKey} onCopy={handleCopy} onDownload={handleDownload} />
            <div className="modal-action mt-2">
              <button onClick={() => setModalCert(null)} className="btn btn-primary btn-sm">Done</button>
            </div>
          </div>
          <div className="modal-backdrop" onClick={() => setModalCert(null)} />
        </div>
      )}

    </main>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusBadge({ status, expiring }: { status: DomainStatus; expiring?: boolean }) {
  if (status === 'active' && expiring) {
    return <span className="badge badge-sm badge-warning gap-1"><AlertTriangle className="w-3 h-3" />Expiring</span>
  }
  const map: Record<DomainStatus, { label: string; cls: string }> = {
    active: { label: 'Active', cls: 'badge-success' },
    pending: { label: 'Pending', cls: 'badge-neutral' },
    pending_challenge: { label: 'DNS Pending', cls: 'badge-warning' },
    expired: { label: 'Expired', cls: 'badge-error' },
    failed: { label: 'Failed', cls: 'badge-error' },
  }
  const { label, cls } = map[status]
  return <span className={`badge badge-sm ${cls}`}>{label}</span>
}

function RowActions({
  cert, recheckPending, retryPending, onRecheck, onRetry,
}: {
  cert: DomainRecord
  recheckPending: boolean
  retryPending: boolean
  onRecheck: () => void
  onRetry: () => void
}) {
  if (cert.status === 'pending_challenge') {
    return (
      <button onClick={onRecheck} disabled={recheckPending} className="btn btn-xs gap-1.5" style={{ background: 'var(--c-primary-soft)', color: 'var(--c-primary)', border: '1px solid var(--c-primary-mid)' }}>
        {recheckPending ? <span className="loading loading-spinner loading-xs" /> : <RefreshCw className="w-3 h-3" />}
        Verify Now
      </button>
    )
  }
  if (cert.status === 'failed' || cert.status === 'expired') {
    return (
      <button onClick={onRetry} disabled={retryPending} className="btn btn-xs gap-1.5" style={{ background: 'var(--c-error-soft)', color: 'var(--c-error)', border: '1px solid oklch(58% 0.22 25 / 0.25)' }}>
        {retryPending ? <span className="loading loading-spinner loading-xs" /> : <RotateCcw className="w-3 h-3" />}
        {cert.status === 'failed' ? 'Retry' : 'Renew'}
      </button>
    )
  }
  if (cert.status === 'active' && isExpiringSoon(cert.expiryDate)) {
    return (
      <button onClick={onRetry} disabled={retryPending} className="btn btn-xs gap-1.5" style={{ background: 'var(--c-warning-soft)', color: 'var(--c-warning)', border: '1px solid oklch(72% 0.19 80 / 0.25)' }}>
        {retryPending ? <span className="loading loading-spinner loading-xs" /> : <RefreshCw className="w-3 h-3" />}
        Renew
      </button>
    )
  }
  return null
}

function ExpandedChallenge({
  cert, copiedKey, recheckPending, recheckError, onCopy, onRecheck,
}: {
  cert: DomainRecord
  copiedKey: string | null
  recheckPending: boolean
  recheckError: string | null
  onCopy: (text: string, key: string) => void
  onRecheck: () => void
}) {
  const txtName = cert.txtRecordName ?? `_acme-challenge.${cert.domainName}`
  const txtValue = cert.txtRecordValue ?? '(not available)'

  return (
    <div className="rounded-xl p-4 mt-1" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border-mid)' }}>
      <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--c-warning)' }}>
        DNS TXT Record Required
      </p>
      <div className="space-y-3 font-mono text-sm">
        {[
          { label: 'Name', value: txtName, key: `${cert._id}-name`, color: 'var(--c-info)' },
          { label: 'Value', value: txtValue, key: `${cert._id}-value`, color: 'var(--c-purple)' },
        ].map(({ label, value, key, color }) => (
          <div key={key} className="flex items-start gap-2">
            <span className="text-xs w-12 shrink-0 pt-0.5" style={{ color: 'var(--c-text-3)' }}>{label}</span>
            <span className="flex-1 break-all text-xs" style={{ color }}>{value}</span>
            <button onClick={() => onCopy(value, key)} className="btn btn-ghost btn-xs btn-square shrink-0">
              {copiedKey === key ? <Check className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" style={{ color: 'var(--c-text-3)' }} />}
            </button>
          </div>
        ))}
      </div>
      {recheckError && (
        <div className="alert alert-error mt-3 text-xs py-2">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>{recheckError}</span>
        </div>
      )}
      <div className="flex justify-end mt-3">
        <button onClick={onRecheck} disabled={recheckPending} className="btn btn-sm btn-primary gap-2">
          {recheckPending
            ? <><span className="loading loading-spinner loading-xs" /> Verifying…</>
            : <><ShieldCheck className="w-3.5 h-3.5" /> Verify &amp; Issue</>}
        </button>
      </div>
    </div>
  )
}

function ChallengeCard({
  challenge, copiedKey, verifyPending, verifyError, onCopy, onVerify, onReset,
}: {
  challenge: ChallengeState
  copiedKey: string | null
  verifyPending: boolean
  verifyError: string | null
  onCopy: (text: string, key: string) => void
  onVerify: () => void
  onReset: () => void
}) {
  return (
    <div className="rounded-2xl p-6 sm:p-8" style={{ background: 'var(--c-card)', border: '1px solid oklch(72% 0.19 80 / 0.35)' }}>
      <div className="flex items-start gap-3 mb-6">
        <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0" style={{ background: 'var(--c-warning-soft)' }}>
          <AlertTriangle className="w-5 h-5" style={{ color: 'var(--c-warning)' }} />
        </div>
        <div>
          <h2 className="text-base font-bold" style={{ color: 'var(--c-text-1)' }}>Action Required: DNS Challenge</h2>
          <p className="text-sm mt-1" style={{ color: 'var(--c-text-2)' }}>
            Add this TXT record to verify ownership of{' '}
            <span className="font-semibold font-mono" style={{ color: 'var(--c-primary)' }}>{challenge.domain}</span>
          </p>
        </div>
      </div>

      <div className="rounded-xl p-5 space-y-5 font-mono text-sm" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border-mid)' }}>
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase tracking-wider" style={{ color: 'var(--c-text-3)' }}>Type</span>
          <span className="badge badge-neutral font-mono text-xs">TXT</span>
        </div>
        {[
          { label: 'Name', value: challenge.txtName, key: 'ch-name', color: 'var(--c-info)' },
          { label: 'Value', value: challenge.txtValue, key: 'ch-value', color: 'var(--c-purple)' },
        ].map(({ label, value, key, color }) => (
          <div key={key} className="space-y-1.5">
            <span className="text-xs uppercase tracking-wider" style={{ color: 'var(--c-text-3)' }}>{label}</span>
            <div className="flex items-center gap-2">
              <span className="flex-1 break-all text-sm" style={{ color }}>{value}</span>
              <button onClick={() => onCopy(value, key)} className="btn btn-ghost btn-xs btn-square shrink-0">
                {copiedKey === key ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" style={{ color: 'var(--c-text-3)' }} />}
              </button>
            </div>
          </div>
        ))}
      </div>

      <p className="text-xs mt-4" style={{ color: 'var(--c-text-3)' }}>
        DNS propagation may take a few minutes after adding the record.
      </p>

      {verifyError && (
        <div className="alert alert-error mt-4 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{verifyError}</span>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3 justify-between mt-5">
        <button onClick={onReset} className="btn btn-ghost btn-sm gap-2" style={{ color: 'var(--c-text-2)' }}>
          <RotateCcw className="w-4 h-4" />
          Start over
        </button>
        <button className="btn btn-primary gap-2" disabled={verifyPending} onClick={onVerify}>
          {verifyPending
            ? <><span className="loading loading-spinner loading-sm" /> Verifying…</>
            : <><ShieldCheck className="w-4 h-4" /> Verify &amp; Issue</>}
        </button>
      </div>
    </div>
  )
}

function CertCard({
  cert, copiedKey, onCopy, onDownload, onReset, resetLabel,
}: {
  cert: CertState
  copiedKey: string | null
  onCopy: (text: string, key: string) => void
  onDownload: (content: string, filename: string) => void
  onReset: () => void
  resetLabel: string
}) {
  return (
    <div className="rounded-2xl p-6 sm:p-8" style={{ background: 'var(--c-card)', border: '1px solid oklch(62% 0.18 158 / 0.35)' }}>
      <div className="flex items-start gap-3 mb-6">
        <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0" style={{ background: 'var(--c-success-soft)' }}>
          <ShieldCheck className="w-5 h-5" style={{ color: 'var(--c-success)' }} />
        </div>
        <div>
          <h2 className="text-base font-bold" style={{ color: 'var(--c-text-1)' }}>Certificate Issued</h2>
          <p className="text-sm mt-1" style={{ color: 'var(--c-text-2)' }}>
            For <span className="font-semibold font-mono" style={{ color: 'var(--c-primary)' }}>{cert.domain}</span>.{' '}
            Save both files — private key shown only once.
          </p>
        </div>
      </div>
      <CertFiles cert={cert.cert} privKey={cert.key} domain={cert.domain} copiedKey={copiedKey} onCopy={onCopy} onDownload={onDownload} />
      <div className="mt-4 flex justify-end">
        <button onClick={onReset} className="btn btn-outline btn-sm gap-2">
          <Plus className="w-4 h-4" />
          {resetLabel}
        </button>
      </div>
    </div>
  )
}

function CertFiles({
  cert, privKey, domain, copiedKey, onCopy, onDownload,
}: {
  cert: string
  privKey: string
  domain: string
  copiedKey: string | null
  onCopy: (text: string, key: string) => void
  onDownload: (content: string, filename: string) => void
}) {
  return (
    <>
      {[
        { label: 'Certificate', value: cert, copyKey: 'cert', filename: `${domain}.crt`, color: 'var(--c-info)' },
        { label: 'Private Key', value: privKey, copyKey: 'key', filename: `${domain}.key`, color: 'var(--c-purple)' },
      ].map(({ label, value, copyKey, filename, color }) => (
        <div key={copyKey} className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--c-text-3)' }}>{label}</span>
            <div className="flex gap-1">
              <button onClick={() => onCopy(value, copyKey)} className="btn btn-ghost btn-xs gap-1.5">
                {copiedKey === copyKey ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedKey === copyKey ? 'Copied' : 'Copy'}
              </button>
              <button onClick={() => onDownload(value, filename)} className="btn btn-ghost btn-xs gap-1.5">
                <Download className="w-3.5 h-3.5" />
                Download
              </button>
            </div>
          </div>
          <div className="rounded-xl p-4 font-mono text-xs overflow-x-auto" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border-mid)', color }}>
            <pre className="whitespace-pre-wrap break-all">
              {value.trim().split('\n').slice(0, 4).join('\n')}
              {value.trim().split('\n').length > 4 && '\n…'}
            </pre>
          </div>
        </div>
      ))}
    </>
  )
}
