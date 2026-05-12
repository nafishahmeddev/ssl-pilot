import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getCertificatesApi, initiateSslApi, verifySslApi, recheckSslApi } from '../api/ssl'
import { getApiError } from '../api/errors'
import type { DomainRecord, IssuedCertificate } from '../types/ssl'
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
} from 'lucide-react'

interface ChallengeState {
  domain: string
  txtName: string
  txtValue: string
}

interface CertState extends IssuedCertificate {
  domain: string
}

function isExpiringSoon(expiryDate?: string): boolean {
  if (!expiryDate) return false
  return new Date(expiryDate).getTime() - Date.now() < 30 * 24 * 60 * 60 * 1000
}

export default function Certificates() {
  const qc = useQueryClient()

  // New issue / retry flow
  const [showForm, setShowForm] = useState(false)
  const [formDomain, setFormDomain] = useState('')
  const [challenge, setChallenge] = useState<ChallengeState | null>(null)
  const [certificate, setCertificate] = useState<CertState | null>(null)

  // Table state
  const [expandedRow, setExpandedRow] = useState<string | null>(null)
  const [modalCert, setModalCert] = useState<CertState | null>(null)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['certificates'],
    queryFn: getCertificatesApi,
    refetchInterval: (query) => {
      const certs = query.state.data?.data.certificates ?? []
      return certs.some((c) => c.status === 'pending_challenge') ? 30_000 : false
    },
  })

  const certs = data?.data.certificates ?? []

  // ── Mutations ──────────────────────────────────────────────────────────────

  const initiateMutation = useMutation({
    mutationFn: (d: string) => initiateSslApi(d),
    onSuccess: (res, domain) => {
      setChallenge({ domain, txtName: res.data.txtName, txtValue: res.data.txtValue })
      setCertificate(null)
      setShowForm(false)
      setExpandedRow(null)
      qc.invalidateQueries({ queryKey: ['certificates'] })
    },
  })

  // Used from the challenge panel (main flow)
  const verifyMutation = useMutation({
    mutationFn: (d: string) => verifySslApi(d),
    onSuccess: (res) => {
      setCertificate({ domain: challenge!.domain, ...res.data })
      setChallenge(null)
      qc.invalidateQueries({ queryKey: ['certificates'] })
    },
  })

  // Used from table row "Verify Now" button
  const recheckMutation = useMutation({
    mutationFn: (d: string) => recheckSslApi(d),
    onSuccess: (res, domain) => {
      setModalCert({ domain, ...res.data })
      setExpandedRow(null)
      qc.invalidateQueries({ queryKey: ['certificates'] })
    },
  })

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleInitiate = (e: React.FormEvent) => {
    e.preventDefault()
    initiateMutation.mutate(formDomain)
  }

  const handleRetry = (domain: string) => {
    initiateMutation.mutate(domain)
  }

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

  const handleReset = () => {
    setShowForm(false)
    setFormDomain('')
    setChallenge(null)
    setCertificate(null)
    initiateMutation.reset()
    verifyMutation.reset()
  }

  const toggleRow = (id: string) => setExpandedRow((prev) => (prev === id ? null : id))

  const activeFlow = showForm || !!challenge || !!certificate

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <main className="flex-1 p-5 lg:p-8 max-w-5xl w-full mx-auto space-y-6">

      {/* Header */}
      <div className="pt-1 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Certificates</h1>
          <p className="text-sm mt-1" style={{ color: 'oklch(52% 0.015 265)' }}>
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

      {/* ── Issue Form ── */}
      {showForm && !challenge && !certificate && (
        <div className="card" style={{ background: 'oklch(17% 0.025 265)', border: '1px solid oklch(26% 0.03 265 / 0.5)' }}>
          <div className="card-body p-6 sm:p-8">
            <h2 className="text-lg font-bold mb-1">Issue New Certificate</h2>
            <p className="text-sm mb-5" style={{ color: 'oklch(52% 0.015 265)' }}>
              Enter a domain to begin the DNS-01 ACME challenge
            </p>
            <form onSubmit={handleInitiate}>
              <div className="flex flex-col sm:flex-row gap-3">
                <label className="input input-bordered flex items-center gap-2.5 flex-1" htmlFor="domain-input">
                  <Globe className="w-4 h-4 shrink-0" style={{ color: 'oklch(44% 0.02 265)' }} />
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
        </div>
      )}

      {/* ── Challenge Panel ── */}
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

      {/* ── Certificate Result ── */}
      {certificate && (
        <CertCard
          cert={certificate}
          copiedKey={copiedKey}
          onCopy={handleCopy}
          onDownload={handleDownload}
          onReset={handleReset}
          resetLabel="Issue another"
        />
      )}

      {/* ── Table ── */}
      <div className="card" style={{ background: 'oklch(17% 0.025 265)', border: '1px solid oklch(26% 0.03 265 / 0.5)' }}>
        <div className="card-body p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold">All Domains</h2>
            {certs.some((c) => c.status === 'pending_challenge') && (
              <span className="flex items-center gap-1.5 text-xs" style={{ color: 'oklch(78% 0.18 78)' }}>
                <span className="loading loading-ring loading-xs" />
                Auto-checking every 30s
              </span>
            )}
          </div>

          {isError && (
            <div className="alert alert-error text-sm mb-4">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>Failed to load certificates.</span>
            </div>
          )}

          {isLoading ? (
            <div className="flex justify-center py-10">
              <span className="loading loading-spinner loading-md" style={{ color: 'oklch(62% 0.26 265)' }} />
            </div>
          ) : certs.length === 0 ? (
            <div className="text-center py-12" style={{ color: 'oklch(44% 0.02 265)' }}>
              <ShieldCheck className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No certificates yet. Issue your first one above.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="table table-sm">
                <thead>
                  <tr style={{ color: 'oklch(46% 0.02 265)' }}>
                    <th />
                    <th>Domain</th>
                    <th>Status</th>
                    <th>Issued</th>
                    <th>Expires</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {certs.map((cert) => (
                    <>
                      <tr key={cert._id} className={expandedRow === cert._id ? 'border-b-0' : ''}>
                        <td className="w-6 pr-0">
                          {cert.status === 'pending_challenge' && (
                            <button
                              onClick={() => toggleRow(cert._id)}
                              className="btn btn-ghost btn-xs btn-square"
                              title="View DNS record"
                            >
                              {expandedRow === cert._id
                                ? <ChevronDown className="w-3.5 h-3.5" />
                                : <ChevronRight className="w-3.5 h-3.5" />}
                            </button>
                          )}
                        </td>
                        <td className="font-mono text-sm">{cert.domainName}</td>
                        <td><StatusBadge status={cert.status} expiring={isExpiringSoon(cert.expiryDate)} /></td>
                        <td className="text-sm" style={{ color: 'oklch(52% 0.015 265)' }}>
                          {new Date(cert.createdAt).toLocaleDateString()}
                        </td>
                        <td className="text-sm" style={{ color: isExpiringSoon(cert.expiryDate) ? 'oklch(78% 0.18 78)' : 'oklch(52% 0.015 265)' }}>
                          {cert.expiryDate ? new Date(cert.expiryDate).toLocaleDateString() : '—'}
                        </td>
                        <td>
                          <RowActions
                            cert={cert}
                            recheckPending={recheckMutation.isPending && recheckMutation.variables === cert.domainName}
                            retryPending={initiateMutation.isPending && initiateMutation.variables === cert.domainName}
                            onRecheck={() => recheckMutation.mutate(cert.domainName)}
                            onRetry={() => handleRetry(cert.domainName)}
                          />
                        </td>
                      </tr>

                      {/* Expanded DNS challenge row */}
                      {expandedRow === cert._id && cert.status === 'pending_challenge' && (
                        <tr key={`${cert._id}-expanded`}>
                          <td colSpan={6} className="pt-0 pb-4 px-4">
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
      </div>

      {/* ── Cert Modal (from table recheck) ── */}
      {modalCert && (
        <div className="modal modal-open">
          <div className="modal-box max-w-2xl" style={{ background: 'oklch(17% 0.025 265)', border: '1px solid oklch(70% 0.20 150 / 0.3)' }}>
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'oklch(70% 0.20 150 / 0.12)' }}>
                  <ShieldCheck className="w-5 h-5" style={{ color: 'oklch(70% 0.20 150)' }} />
                </div>
                <div>
                  <h3 className="font-bold text-lg leading-none">Certificate Issued</h3>
                  <p className="text-xs mt-1 font-mono" style={{ color: 'oklch(74% 0.20 196)' }}>{modalCert.domain}</p>
                </div>
              </div>
              <button onClick={() => setModalCert(null)} className="btn btn-ghost btn-sm btn-square">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-sm mb-5" style={{ color: 'oklch(52% 0.015 265)' }}>
              Save both files securely — the private key is shown only once.
            </p>
            {[
              { label: 'Certificate', value: modalCert.cert, key: 'modal-cert', filename: `${modalCert.domain}.crt`, color: 'oklch(74% 0.20 196)' },
              { label: 'Private Key', value: modalCert.key, key: 'modal-key', filename: `${modalCert.domain}.key`, color: 'oklch(78% 0.18 300)' },
            ].map(({ label, value, key, filename, color }) => (
              <div key={key} className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'oklch(50% 0.02 265)' }}>{label}</span>
                  <div className="flex gap-1">
                    <button onClick={() => handleCopy(value, key)} className="btn btn-ghost btn-xs gap-1.5">
                      {copiedKey === key ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
                      {copiedKey === key ? 'Copied' : 'Copy'}
                    </button>
                    <button onClick={() => handleDownload(value, filename)} className="btn btn-ghost btn-xs gap-1.5">
                      <Download className="w-3.5 h-3.5" />
                      Download
                    </button>
                  </div>
                </div>
                <div className="rounded-xl p-4 font-mono text-xs overflow-x-auto" style={{ background: 'oklch(13% 0.02 265)', border: '1px solid oklch(22% 0.03 265 / 0.6)', color }}>
                  <pre className="whitespace-pre-wrap break-all">
                    {value.trim().split('\n').slice(0, 4).join('\n')}
                    {value.trim().split('\n').length > 4 && '\n…'}
                  </pre>
                </div>
              </div>
            ))}
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

function StatusBadge({ status, expiring }: { status: DomainRecord['status']; expiring?: boolean }) {
  if (status === 'active' && expiring) {
    return <span className="badge badge-sm badge-warning gap-1"><AlertTriangle className="w-3 h-3" />Expiring</span>
  }
  const map: Record<DomainRecord['status'], { label: string; cls: string }> = {
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
  cert,
  recheckPending,
  retryPending,
  onRecheck,
  onRetry,
}: {
  cert: DomainRecord
  recheckPending: boolean
  retryPending: boolean
  onRecheck: () => void
  onRetry: () => void
}) {
  if (cert.status === 'pending_challenge') {
    return (
      <button
        onClick={onRecheck}
        disabled={recheckPending}
        className="btn btn-xs btn-outline gap-1.5"
        style={{ borderColor: 'oklch(62% 0.26 265 / 0.4)', color: 'oklch(72% 0.20 265)' }}
        title="Re-attempt ACME verification"
      >
        {recheckPending
          ? <span className="loading loading-spinner loading-xs" />
          : <RefreshCw className="w-3 h-3" />}
        Verify Now
      </button>
    )
  }

  if (cert.status === 'failed' || cert.status === 'expired') {
    return (
      <button
        onClick={onRetry}
        disabled={retryPending}
        className="btn btn-xs btn-outline gap-1.5"
        style={{ borderColor: 'oklch(78% 0.18 300 / 0.4)', color: 'oklch(78% 0.18 300)' }}
      >
        {retryPending
          ? <span className="loading loading-spinner loading-xs" />
          : <RotateCcw className="w-3 h-3" />}
        {cert.status === 'failed' ? 'Retry' : 'Renew'}
      </button>
    )
  }

  if (cert.status === 'active' && isExpiringSoon(cert.expiryDate)) {
    return (
      <button
        onClick={onRetry}
        disabled={retryPending}
        className="btn btn-xs btn-outline gap-1.5"
        style={{ borderColor: 'oklch(78% 0.18 78 / 0.5)', color: 'oklch(78% 0.18 78)' }}
      >
        {retryPending
          ? <span className="loading loading-spinner loading-xs" />
          : <RefreshCw className="w-3 h-3" />}
        Renew
      </button>
    )
  }

  return null
}

function ExpandedChallenge({
  cert,
  copiedKey,
  recheckPending,
  recheckError,
  onCopy,
  onRecheck,
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
    <div className="rounded-xl p-4 mt-1" style={{ background: 'oklch(13% 0.02 265)', border: '1px solid oklch(78% 0.18 78 / 0.2)' }}>
      <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'oklch(78% 0.18 78)' }}>
        DNS TXT Record Required
      </p>
      <div className="space-y-3 font-mono text-sm">
        {[
          { label: 'Name', value: txtName, key: `${cert._id}-name`, color: 'oklch(74% 0.20 196)' },
          { label: 'Value', value: txtValue, key: `${cert._id}-value`, color: 'oklch(78% 0.18 300)' },
        ].map(({ label, value, key, color }) => (
          <div key={key} className="flex items-start gap-2">
            <span className="text-xs w-12 shrink-0 pt-0.5" style={{ color: 'oklch(44% 0.02 265)' }}>{label}</span>
            <span className="flex-1 break-all" style={{ color }}>{value}</span>
            <button onClick={() => onCopy(value, key)} className="btn btn-ghost btn-xs btn-square shrink-0">
              {copiedKey === key ? <Check className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />}
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
        <button
          onClick={onRecheck}
          disabled={recheckPending}
          className="btn btn-sm btn-success gap-2"
        >
          {recheckPending
            ? <><span className="loading loading-spinner loading-xs" /> Verifying…</>
            : <><ShieldCheck className="w-3.5 h-3.5" /> Verify &amp; Issue</>}
        </button>
      </div>
    </div>
  )
}

function ChallengeCard({
  challenge,
  copiedKey,
  verifyPending,
  verifyError,
  onCopy,
  onVerify,
  onReset,
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
    <div className="card" style={{ background: 'oklch(17% 0.025 265)', border: '1px solid oklch(78% 0.18 78 / 0.28)' }}>
      <div className="card-body p-6 sm:p-8">
        <div className="flex items-start gap-3 mb-6">
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 mt-0.5" style={{ background: 'oklch(78% 0.18 78 / 0.1)' }}>
            <AlertTriangle className="w-5 h-5" style={{ color: 'oklch(78% 0.18 78)' }} />
          </div>
          <div>
            <h2 className="text-lg font-bold">Action Required: DNS Challenge</h2>
            <p className="text-sm mt-1" style={{ color: 'oklch(52% 0.015 265)' }}>
              Add this TXT record to verify ownership of{' '}
              <span className="font-semibold font-mono" style={{ color: 'oklch(74% 0.20 196)' }}>{challenge.domain}</span>
            </p>
          </div>
        </div>

        <div className="rounded-xl p-5 space-y-5 font-mono text-sm" style={{ background: 'oklch(13% 0.02 265)', border: '1px solid oklch(22% 0.03 265 / 0.6)' }}>
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider" style={{ color: 'oklch(44% 0.02 265)' }}>Type</span>
            <span className="badge badge-neutral font-mono text-xs">TXT</span>
          </div>
          {[
            { label: 'Name', value: challenge.txtName, key: 'ch-name', color: 'oklch(74% 0.20 196)' },
            { label: 'Value', value: challenge.txtValue, key: 'ch-value', color: 'oklch(78% 0.18 300)' },
          ].map(({ label, value, key, color }) => (
            <div key={key} className="space-y-2">
              <span className="text-xs uppercase tracking-wider" style={{ color: 'oklch(44% 0.02 265)' }}>{label}</span>
              <div className="flex items-center gap-2">
                <span className="flex-1 break-all text-sm" style={{ color }}>{value}</span>
                <button onClick={() => onCopy(value, key)} className="btn btn-ghost btn-xs btn-square shrink-0">
                  {copiedKey === key ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" style={{ color: 'oklch(46% 0.02 265)' }} />}
                </button>
              </div>
            </div>
          ))}
        </div>

        <p className="text-xs mt-4" style={{ color: 'oklch(42% 0.015 265)' }}>
          DNS propagation may take a few minutes after adding the record.
        </p>

        {verifyError && (
          <div className="alert alert-error mt-4 text-sm">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{verifyError}</span>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3 justify-between mt-4">
          <button onClick={onReset} className="btn btn-ghost btn-sm gap-2">
            <RotateCcw className="w-4 h-4" />
            Start over
          </button>
          <button className="btn btn-success gap-2" disabled={verifyPending} onClick={onVerify}>
            {verifyPending
              ? <><span className="loading loading-spinner loading-sm" /> Verifying…</>
              : <><ShieldCheck className="w-4 h-4" /> Verify &amp; Issue</>}
          </button>
        </div>
      </div>
    </div>
  )
}

function CertCard({
  cert,
  copiedKey,
  onCopy,
  onDownload,
  onReset,
  resetLabel,
}: {
  cert: CertState
  copiedKey: string | null
  onCopy: (text: string, key: string) => void
  onDownload: (content: string, filename: string) => void
  onReset: () => void
  resetLabel: string
}) {
  return (
    <div className="card" style={{ background: 'oklch(17% 0.025 265)', border: '1px solid oklch(70% 0.20 150 / 0.3)' }}>
      <div className="card-body p-6 sm:p-8">
        <div className="flex items-start gap-3 mb-6">
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 mt-0.5" style={{ background: 'oklch(70% 0.20 150 / 0.12)' }}>
            <ShieldCheck className="w-5 h-5" style={{ color: 'oklch(70% 0.20 150)' }} />
          </div>
          <div>
            <h2 className="text-lg font-bold">Certificate Issued</h2>
            <p className="text-sm mt-1" style={{ color: 'oklch(52% 0.015 265)' }}>
              For <span className="font-semibold font-mono" style={{ color: 'oklch(74% 0.20 196)' }}>{cert.domain}</span>.
              {' '}Save both files — the private key is shown only once.
            </p>
          </div>
        </div>

        {[
          { label: 'Certificate', value: cert.cert, copyKey: 'res-cert', filename: `${cert.domain}.crt`, color: 'oklch(74% 0.20 196)' },
          { label: 'Private Key', value: cert.key, copyKey: 'res-key', filename: `${cert.domain}.key`, color: 'oklch(78% 0.18 300)' },
        ].map(({ label, value, copyKey, filename, color }) => (
          <div key={copyKey} className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'oklch(50% 0.02 265)' }}>{label}</span>
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
            <div className="rounded-xl p-4 font-mono text-xs overflow-x-auto" style={{ background: 'oklch(13% 0.02 265)', border: '1px solid oklch(22% 0.03 265 / 0.6)', color }}>
              <pre className="whitespace-pre-wrap break-all">
                {value.trim().split('\n').slice(0, 4).join('\n')}
                {value.trim().split('\n').length > 4 && '\n…'}
              </pre>
            </div>
          </div>
        ))}

        <div className="mt-2 flex justify-end">
          <button onClick={onReset} className="btn btn-outline btn-sm gap-2">
            <Plus className="w-4 h-4" />
            {resetLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
