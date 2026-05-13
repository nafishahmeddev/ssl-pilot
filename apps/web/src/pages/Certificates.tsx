import { useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getCertificatesApi, initiateSslApi, verifySslApi, generateSslApi } from '../api/ssl'
import { getApiError } from '../api/errors'
import { useCooldown } from '../hooks/useCooldown'
import { ChallengeType, DomainType } from '../types/ssl'
import type { DomainStatus, IssuedCertificate, ChallengeInfo } from '../types/ssl'
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
  X,
  ExternalLink,
  FileText,
  ArrowRight,
} from 'lucide-react'

const FQDN_REGEX = /^(\*\.)?([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/

// ── Local types ───────────────────────────────────────────────────────────────

type ChallengeState = ChallengeInfo & { domain: string }
interface CertState extends IssuedCertificate { domain: string }

function isExpiringSoon(expiryDate?: string): boolean {
  if (!expiryDate) return false
  return new Date(expiryDate).getTime() - Date.now() < 30 * 24 * 60 * 60 * 1000
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function Certificates() {
  const qc = useQueryClient()

  const [showForm, setShowForm]         = useState(false)
  const [formDomain, setFormDomain]     = useState('')
  const [formChallengeType, setFormChallengeType] = useState<typeof ChallengeType[keyof typeof ChallengeType]>(ChallengeType.DNS_01)
  const [challenge, setChallenge]             = useState<ChallengeState | null>(null)
  const [challengeVerifiedDomain, setChallengeVerifiedDomain] = useState<string | null>(null)
  const [certificate, setCertificate]         = useState<CertState | null>(null)
  const [modalCert, setModalCert]             = useState<CertState | null>(null)
  const [copiedKey, setCopiedKey]             = useState<string | null>(null)

  // Per-domain cooldown tracking (45s initiate, 60s verify)
  const [cooldowns, setCooldowns] = useState<Map<string, number>>(new Map())

  const startDomainCooldown = useCallback((domain: string, ms: number) => {
    setCooldowns(prev => new Map(prev).set(domain, Date.now() + ms))
    setTimeout(() => {
      setCooldowns(prev => { const next = new Map(prev); next.delete(domain); return next })
    }, ms)
  }, [])

  const isCooling = useCallback(
    (domain: string) => (cooldowns.get(domain) ?? 0) > Date.now(),
    [cooldowns],
  )

  const verifyCD = useCooldown(60_000)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['certificates'],
    queryFn: getCertificatesApi,
  })
  const certs = data?.data.certificates ?? []

  const initiateMutation = useMutation({
    mutationFn: ({ domain, challengeType }: { domain: string; challengeType: typeof ChallengeType[keyof typeof ChallengeType] }) =>
      initiateSslApi(domain, challengeType),
    onSettled: (_, __, vars) => startDomainCooldown(vars.domain, 45_000),
    onSuccess: (res, vars) => {
      setChallenge({ domain: vars.domain, ...res.data })
      setCertificate(null)
      setShowForm(false)
      qc.invalidateQueries({ queryKey: ['certificates'] })
    },
  })

  const verifyMutation = useMutation({
    mutationFn: (domain: string) => verifySslApi(domain),
    onSettled: () => verifyCD.start(),
    onSuccess: (_, domain) => {
      setChallengeVerifiedDomain(domain)
      setChallenge(null)
      qc.invalidateQueries({ queryKey: ['certificates'] })
    },
  })

  const generateMutation = useMutation({
    mutationFn: (domain: string) => generateSslApi(domain),
    onSuccess: (res, domain) => {
      setCertificate({ domain, ...res.data })
      setChallengeVerifiedDomain(null)
      qc.invalidateQueries({ queryKey: ['certificates'] })
    },
  })

  const handleInitiate = (e: React.FormEvent) => {
    e.preventDefault()
    if (isCooling(formDomain)) return
    initiateMutation.mutate({ domain: formDomain, challengeType: formChallengeType })
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
    setShowForm(false)
    setFormDomain('')
    setChallenge(null)
    setChallengeVerifiedDomain(null)
    setCertificate(null)
    initiateMutation.reset()
    verifyMutation.reset()
    generateMutation.reset()
  }

  const activeFlow = showForm || !!challenge || !!challengeVerifiedDomain || !!certificate
  const isWildcard    = formDomain.startsWith('*.')
  const isDomainValid = formDomain.length > 0 && FQDN_REGEX.test(formDomain)

  const handleDomainChange = (value: string) => {
    setFormDomain(value)
    if (value.startsWith('*.')) setFormChallengeType(ChallengeType.DNS_01)
  }

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

      {/* Issue Form — guided 3-step onboarding */}
      {showForm && !challenge && !certificate && (
        <div className="rounded-2xl p-6 sm:p-8" style={{ background: 'var(--c-card)', border: '1px solid var(--c-border)' }}>
          <StepIndicator step={1} />

          <div className="mt-6 mb-5">
            <h2 className="text-base font-bold" style={{ color: 'var(--c-text-1)' }}>Issue New Certificate</h2>
            <p className="text-sm mt-1" style={{ color: 'var(--c-text-2)' }}>
              Enter your domain name, then choose how you'll prove you own it.
            </p>
          </div>

          <form onSubmit={handleInitiate} className="space-y-5">

            {/* Step 1a — Domain input */}
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider mb-2 block" style={{ color: 'var(--c-text-3)' }}>
                Domain Name
              </label>
              <label
                className="input input-bordered flex items-center gap-2.5 w-full"
                htmlFor="domain-input"
                style={
                  formDomain && !isDomainValid
                    ? { borderColor: 'var(--c-error)' }
                    : formDomain && isDomainValid
                    ? { borderColor: 'var(--c-success)' }
                    : {}
                }
              >
                <Globe className="w-4 h-4 shrink-0" style={{ color: 'var(--c-text-3)' }} />
                <input
                  id="domain-input"
                  type="text"
                  value={formDomain}
                  onChange={(e) => handleDomainChange(e.target.value)}
                  className="grow bg-transparent outline-none font-mono"
                  placeholder="example.com or *.example.com"
                  autoFocus
                />
                {formDomain && (
                  isDomainValid
                    ? <Check className="w-4 h-4 shrink-0 text-success" />
                    : <X className="w-4 h-4 shrink-0" style={{ color: 'var(--c-error)' }} />
                )}
              </label>
              {formDomain && !isDomainValid && (
                <p className="text-xs mt-1.5" style={{ color: 'var(--c-error)' }}>
                  Enter a valid domain — e.g. <span className="font-mono">example.com</span> or <span className="font-mono">*.example.com</span>
                </p>
              )}
              {isWildcard && isDomainValid && (
                <p className="text-xs mt-1.5" style={{ color: 'var(--c-text-3)' }}>
                  Wildcard — this certificate will cover all direct subdomains (e.g. <span className="font-mono">app.example.com</span>, <span className="font-mono">api.example.com</span>).
                </p>
              )}
            </div>

            {/* Step 1b — Method selection */}
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider mb-3 block" style={{ color: 'var(--c-text-3)' }}>
                Verification Method
              </label>
              <div className="grid sm:grid-cols-2 gap-3">

                {/* DNS-01 */}
                <button
                  type="button"
                  onClick={() => setFormChallengeType(ChallengeType.DNS_01)}
                  className="text-left rounded-xl p-4 border-2 transition-all"
                  style={
                    formChallengeType === ChallengeType.DNS_01
                      ? { borderColor: 'var(--c-primary)', background: 'var(--c-primary-soft)' }
                      : { borderColor: 'var(--c-border)', background: 'var(--c-surface)' }
                  }
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Globe className="w-4 h-4 shrink-0" style={{ color: formChallengeType === ChallengeType.DNS_01 ? 'var(--c-primary)' : 'var(--c-text-2)' }} />
                    <span className="font-semibold text-sm" style={{ color: 'var(--c-text-1)' }}>DNS-01</span>
                    <span className="badge badge-xs badge-success ml-auto">Recommended</span>
                  </div>
                  <p className="text-xs leading-relaxed" style={{ color: 'var(--c-text-2)' }}>
                    Add a TXT record to your domain's DNS. Supports wildcards (*.example.com) and all domain types.
                  </p>
                  <p className="text-xs mt-2.5 font-medium" style={{ color: 'var(--c-text-3)' }}>
                    Requires: DNS provider access
                  </p>
                </button>

                {/* HTTP-01 */}
                <button
                  type="button"
                  disabled={isWildcard}
                  onClick={() => !isWildcard && setFormChallengeType(ChallengeType.HTTP_01)}
                  className="text-left rounded-xl p-4 border-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  style={
                    formChallengeType === ChallengeType.HTTP_01 && !isWildcard
                      ? { borderColor: 'var(--c-primary)', background: 'var(--c-primary-soft)' }
                      : { borderColor: 'var(--c-border)', background: 'var(--c-surface)' }
                  }
                >
                  <div className="flex items-center gap-2 mb-2">
                    <FileText className="w-4 h-4 shrink-0" style={{ color: formChallengeType === ChallengeType.HTTP_01 && !isWildcard ? 'var(--c-primary)' : 'var(--c-text-2)' }} />
                    <span className="font-semibold text-sm" style={{ color: 'var(--c-text-1)' }}>HTTP-01</span>
                    {isWildcard && <span className="badge badge-xs badge-error ml-auto">No wildcards</span>}
                  </div>
                  <p className="text-xs leading-relaxed" style={{ color: 'var(--c-text-2)' }}>
                    Serve a small verification file on your web server. Straightforward if you have direct server access.
                  </p>
                  <p className="text-xs mt-2.5 font-medium" style={{ color: 'var(--c-text-3)' }}>
                    Requires: port 80 open · no wildcards
                  </p>
                </button>

              </div>
              {isWildcard && (
                <p className="text-xs mt-2" style={{ color: 'var(--c-warning)' }}>
                  Wildcard certificates require DNS-01 — per RFC 8555, HTTP-01 cannot verify wildcards.
                </p>
              )}
            </div>

            {/* "What happens next" hint */}
            <div className="rounded-xl px-4 py-3 flex items-start gap-2.5" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
              <ArrowRight className="w-4 h-4 shrink-0 mt-0.5" style={{ color: 'var(--c-text-3)' }} />
              <p className="text-xs" style={{ color: 'var(--c-text-2)' }}>
                {formChallengeType === ChallengeType.DNS_01
                  ? "Next: you'll receive a TXT record name and value to add in your DNS provider. Once added, come back to verify."
                  : "Next: you'll receive a file path and content to publish on your server at port 80. Once live, come back to verify."}
              </p>
            </div>

            {initiateMutation.isError && (
              <div className="alert alert-error text-sm">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{getApiError(initiateMutation.error, 'Failed to initiate certificate.')}</span>
              </div>
            )}

            <div className="flex gap-3 justify-end pt-1">
              <button type="button" onClick={handleReset} className="btn btn-ghost">Cancel</button>
              <button
                type="submit"
                disabled={!isDomainValid || initiateMutation.isPending || isCooling(formDomain)}
                className="btn btn-primary gap-2"
              >
                {initiateMutation.isPending
                  ? <><span className="loading loading-spinner loading-sm" /> Initiating…</>
                  : <>Continue <ArrowRight className="w-4 h-4" /></>}
              </button>
            </div>

          </form>
        </div>
      )}

      {/* Step 2 — Challenge Panel */}
      {challenge && (
        <ChallengeCard
          challenge={challenge}
          copiedKey={copiedKey}
          verifyPending={verifyMutation.isPending}
          verifyIsCooling={verifyCD.isCooling}
          verifyCooldownLeft={verifyCD.secondsLeft}
          verifyError={verifyMutation.isError ? getApiError(verifyMutation.error, 'Verification failed. Check your DNS record or HTTP file.') : null}
          onCopy={handleCopy}
          onVerify={() => verifyMutation.mutate(challenge.domain)}
          onReset={handleReset}
        />
      )}

      {/* Step 3 — Challenge Verified Panel */}
      {challengeVerifiedDomain && (
        <ChallengeVerifiedCard
          domain={challengeVerifiedDomain}
          generatePending={generateMutation.isPending}
          generateError={generateMutation.isError ? getApiError(generateMutation.error, 'Certificate generation failed.') : null}
          onGenerate={() => generateMutation.mutate(challengeVerifiedDomain)}
          onReset={handleReset}
        />
      )}

      {/* Step 4 — Certificate Result */}
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
                  <th>Domain</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Method</th>
                  <th>Issued</th>
                  <th>Expires</th>
                </tr>
              </thead>
              <tbody>
                {certs.map((cert) => (
                  <tr key={cert._id} className="hover">
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
                      <DomainTypeBadge domainType={cert.domainType} />
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
                    <td>
                      {cert.challengeType ? (
                        <span className="badge badge-sm badge-ghost font-mono">
                          {cert.challengeType}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--c-text-3)' }}>—</span>
                      )}
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Cert Modal (from recheck via detail page — not used here anymore, kept for future) */}
      {modalCert && (
        <div className="modal modal-open">
          <div
            className="modal-box max-w-2xl"
            style={{ background: 'var(--c-card)', borderColor: 'oklch(62% 0.18 158 / 0.3)' }}
          >
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
            <CertFiles
              cert={modalCert.cert}
              privKey={modalCert.key}
              domain={modalCert.domain}
              copiedKey={copiedKey}
              onCopy={handleCopy}
              onDownload={handleDownload}
            />
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

function StepIndicator({ step }: { step: 1 | 2 | 3 | 4 }) {
  const steps: { n: 1 | 2 | 3 | 4; label: string }[] = [
    { n: 1, label: 'Configure' },
    { n: 2, label: 'Prove Ownership' },
    { n: 3, label: 'Generate' },
    { n: 4, label: 'Done' },
  ]
  return (
    <div className="flex items-center">
      {steps.map(({ n, label }, i) => {
        const done   = step > n
        const active = step === n
        const last   = i === steps.length - 1
        return (
          <div key={n} className="flex items-center">
            <div className="flex items-center gap-1.5">
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-colors"
                style={{
                  background: done || active ? 'var(--c-primary)' : 'var(--c-surface-2)',
                  color: done || active ? '#fff' : 'var(--c-text-3)',
                }}
              >
                {done ? <Check className="w-3 h-3" /> : n}
              </div>
              <span
                className="text-xs font-medium hidden sm:block"
                style={{ color: active ? 'var(--c-text-1)' : done ? 'var(--c-text-2)' : 'var(--c-text-3)' }}
              >
                {label}
              </span>
            </div>
            {!last && (
              <div
                className="h-px w-4 sm:w-7 mx-1.5 transition-colors"
                style={{ background: step > n ? 'var(--c-primary)' : 'var(--c-border)' }}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

function DomainTypeBadge({ domainType }: { domainType: DomainType }) {
  return domainType === DomainType.WILDCARD
    ? <span className="badge badge-sm badge-ghost font-mono">wildcard</span>
    : <span className="badge badge-sm badge-ghost font-mono">single</span>
}

function StatusBadge({ status, expiring }: { status: DomainStatus; expiring?: boolean }) {
  if (status === 'active' && expiring) {
    return (
      <span className="badge badge-sm badge-warning gap-1">
        <AlertTriangle className="w-3 h-3" />
        Expiring
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
  return <span className={`badge badge-sm ${cls}`}>{label}</span>
}

function ChallengeCard({
  challenge,
  copiedKey,
  verifyPending,
  verifyIsCooling,
  verifyCooldownLeft,
  verifyError,
  onCopy,
  onVerify,
  onReset,
}: {
  challenge: ChallengeState
  copiedKey: string | null
  verifyPending: boolean
  verifyIsCooling: boolean
  verifyCooldownLeft: number
  verifyError: string | null
  onCopy: (text: string, key: string) => void
  onVerify: () => void
  onReset: () => void
}) {
  const isDns  = challenge.challengeType === ChallengeType.DNS_01
  const isHttp = challenge.challengeType === ChallengeType.HTTP_01

  return (
    <div className="rounded-2xl p-6 sm:p-8" style={{ background: 'var(--c-card)', border: '1px solid oklch(72% 0.19 80 / 0.35)' }}>
      <StepIndicator step={2} />
      <div className="flex items-start gap-3 mt-6 mb-5">
        <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0" style={{ background: 'var(--c-warning-soft)' }}>
          <AlertTriangle className="w-5 h-5" style={{ color: 'var(--c-warning)' }} />
        </div>
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <h2 className="text-base font-bold" style={{ color: 'var(--c-text-1)' }}>
              {isDns ? 'Action Required: DNS Challenge' : 'Action Required: HTTP Challenge'}
            </h2>
            <span className="badge badge-sm badge-ghost font-mono">{challenge.challengeType}</span>
          </div>
          <p className="text-sm" style={{ color: 'var(--c-text-2)' }}>
            {isDns ? 'Prove you control ' : 'Prove you control '}
            <span className="font-semibold font-mono" style={{ color: 'var(--c-primary)' }}>{challenge.domain}</span>
            {isDns ? ' by adding a TXT record to your DNS.' : ' by serving a file on your web server.'}
          </p>
        </div>
      </div>

      {/* DNS-01: guide steps + fields */}
      {isDns && (
        <>
          <ol className="space-y-1.5 mb-4 text-xs" style={{ color: 'var(--c-text-2)' }}>
            <li className="flex gap-2">
              <span className="font-bold shrink-0" style={{ color: 'var(--c-primary)' }}>1.</span>
              Log in to your DNS provider (Cloudflare, Route 53, Namecheap, etc.)
            </li>
            <li className="flex gap-2">
              <span className="font-bold shrink-0" style={{ color: 'var(--c-primary)' }}>2.</span>
              Create a new <span className="font-mono font-semibold">TXT</span> record with the Name and Value below
            </li>
            <li className="flex gap-2">
              <span className="font-bold shrink-0" style={{ color: 'var(--c-primary)' }}>3.</span>
              Wait 1–5 minutes for DNS to propagate, then click Verify &amp; Issue
            </li>
          </ol>
          <div className="rounded-xl p-5 space-y-5 font-mono text-sm" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border-mid)' }}>
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-wider" style={{ color: 'var(--c-text-3)' }}>Record Type</span>
              <span className="badge badge-neutral font-mono text-xs">TXT</span>
            </div>
            {[
              { label: 'Name',  value: challenge.txtName,  key: 'ch-dns-name',  color: 'var(--c-info)'   },
              { label: 'Value', value: challenge.txtValue, key: 'ch-dns-value', color: 'var(--c-purple)' },
            ].map(({ label, value, key, color }) => (
              <div key={key} className="space-y-1.5">
                <span className="text-xs uppercase tracking-wider" style={{ color: 'var(--c-text-3)' }}>{label}</span>
                <div className="flex items-center gap-2">
                  <span className="flex-1 break-all text-sm" style={{ color }}>{value}</span>
                  <button onClick={() => onCopy(value, key)} className="btn btn-ghost btn-xs btn-square shrink-0">
                    {copiedKey === key
                      ? <Check className="w-3.5 h-3.5 text-success" />
                      : <Copy className="w-3.5 h-3.5" style={{ color: 'var(--c-text-3)' }} />}
                  </button>
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs mt-3" style={{ color: 'var(--c-text-3)' }}>
            Some providers require only the subdomain part for the Name (e.g. <span className="font-mono">_acme-challenge</span> instead of the full FQDN). Check your provider's docs if the record won't save.
          </p>
        </>
      )}

      {/* HTTP-01: guide steps + fields */}
      {isHttp && (
        <>
          <ol className="space-y-1.5 mb-4 text-xs" style={{ color: 'var(--c-text-2)' }}>
            <li className="flex gap-2">
              <span className="font-bold shrink-0" style={{ color: 'var(--c-primary)' }}>1.</span>
              On your server, create the directory <span className="font-mono">/.well-known/acme-challenge/</span> inside your document root
            </li>
            <li className="flex gap-2">
              <span className="font-bold shrink-0" style={{ color: 'var(--c-primary)' }}>2.</span>
              Create a file named exactly <span className="font-mono font-semibold">{challenge.token}</span> (no extension) and paste the File Content below into it
            </li>
            <li className="flex gap-2">
              <span className="font-bold shrink-0" style={{ color: 'var(--c-primary)' }}>3.</span>
              Confirm the file loads at the Challenge URL over plain HTTP (port 80, not HTTPS)
            </li>
            <li className="flex gap-2">
              <span className="font-bold shrink-0" style={{ color: 'var(--c-primary)' }}>4.</span>
              Click Verify &amp; Issue — Let's Encrypt will fetch the file to confirm ownership
            </li>
          </ol>
          <div className="rounded-xl p-5 space-y-5 font-mono text-sm" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border-mid)' }}>
            <div className="space-y-1.5">
              <span className="text-xs uppercase tracking-wider" style={{ color: 'var(--c-text-3)' }}>Challenge URL</span>
              <div className="flex items-center gap-2">
                <span className="flex-1 break-all text-sm" style={{ color: 'var(--c-info)' }}>
                  {`http://${challenge.domain}/.well-known/acme-challenge/${challenge.token}`}
                </span>
                <button
                  onClick={() => onCopy(`http://${challenge.domain}/.well-known/acme-challenge/${challenge.token}`, 'ch-http-url')}
                  className="btn btn-ghost btn-xs btn-square shrink-0"
                >
                  {copiedKey === 'ch-http-url'
                    ? <Check className="w-3.5 h-3.5 text-success" />
                    : <Copy className="w-3.5 h-3.5" style={{ color: 'var(--c-text-3)' }} />}
                </button>
              </div>
            </div>
            <div className="space-y-1.5">
              <span className="text-xs uppercase tracking-wider" style={{ color: 'var(--c-text-3)' }}>File Content</span>
              <div className="flex items-center gap-2">
                <span className="flex-1 break-all text-sm" style={{ color: 'var(--c-purple)' }}>{challenge.keyAuth}</span>
                <button onClick={() => onCopy(challenge.keyAuth, 'ch-http-content')} className="btn btn-ghost btn-xs btn-square shrink-0">
                  {copiedKey === 'ch-http-content'
                    ? <Check className="w-3.5 h-3.5 text-success" />
                    : <Copy className="w-3.5 h-3.5" style={{ color: 'var(--c-text-3)' }} />}
                </button>
              </div>
            </div>
          </div>
          <p className="text-xs mt-3" style={{ color: 'var(--c-text-3)' }}>
            The file must be served as plain text with no extra whitespace or newlines. HTTP → HTTPS redirects will cause verification to fail.
          </p>
        </>
      )}

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
        <button
          className="btn btn-primary gap-2"
          disabled={verifyPending || verifyIsCooling}
          onClick={onVerify}
        >
          {verifyPending
            ? <><span className="loading loading-spinner loading-sm" /> Verifying…</>
            : verifyIsCooling
            ? <><ShieldCheck className="w-4 h-4" /> Wait {verifyCooldownLeft}s</>
            : <><ShieldCheck className="w-4 h-4" /> Verify &amp; Issue</>}
        </button>
      </div>
    </div>
  )
}

function ChallengeVerifiedCard({
  domain,
  generatePending,
  generateError,
  onGenerate,
  onReset,
}: {
  domain: string
  generatePending: boolean
  generateError: string | null
  onGenerate: () => void
  onReset: () => void
}) {
  return (
    <div className="rounded-2xl p-6 sm:p-8" style={{ background: 'var(--c-card)', border: '1px solid oklch(62% 0.18 158 / 0.35)' }}>
      <StepIndicator step={3} />
      <div className="flex items-start gap-3 mt-6 mb-5">
        <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0" style={{ background: 'var(--c-success-soft)' }}>
          <ShieldCheck className="w-5 h-5" style={{ color: 'var(--c-success)' }} />
        </div>
        <div>
          <h2 className="text-base font-bold" style={{ color: 'var(--c-text-1)' }}>Ownership Verified</h2>
          <p className="text-sm mt-1" style={{ color: 'var(--c-text-2)' }}>
            Let's Encrypt confirmed you control{' '}
            <span className="font-semibold font-mono" style={{ color: 'var(--c-primary)' }}>{domain}</span>.
            Generate the certificate to complete issuance.
          </p>
        </div>
      </div>

      <div
        className="rounded-xl px-4 py-3 mb-5 flex items-start gap-2.5"
        style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}
      >
        <ArrowRight className="w-4 h-4 shrink-0 mt-0.5" style={{ color: 'var(--c-text-3)' }} />
        <p className="text-xs" style={{ color: 'var(--c-text-2)' }}>
          Clicking Generate creates a private key and CSR, then finalises the order with Let's Encrypt.
          The private key is shown <strong>only once</strong> — save it immediately.
        </p>
      </div>

      {generateError && (
        <div className="alert alert-error mb-4 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{generateError}</span>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3 justify-between">
        <button onClick={onReset} className="btn btn-ghost btn-sm gap-2" style={{ color: 'var(--c-text-2)' }}>
          <RotateCcw className="w-4 h-4" />
          Start over
        </button>
        <button
          className="btn btn-primary gap-2"
          disabled={generatePending}
          onClick={onGenerate}
        >
          {generatePending
            ? <><span className="loading loading-spinner loading-sm" /> Generating…</>
            : <><ShieldCheck className="w-4 h-4" /> Generate Certificate</>}
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
      <StepIndicator step={4} />
      <div className="flex items-start gap-3 mt-6 mb-6">
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
        { label: 'Certificate', value: cert,    copyKey: 'cert', filename: `${domain}.crt`, color: 'var(--c-info)'   },
        { label: 'Private Key', value: privKey, copyKey: 'key',  filename: `${domain}.key`, color: 'var(--c-purple)' },
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
