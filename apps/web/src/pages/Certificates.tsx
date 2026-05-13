import { useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getDomainsApi,
  initiateSslApi,
  verifySslApi,
  generateSslApi,
  checkWildcardApi,
  adoptWildcardApi,
  deleteDomainApi,
  deleteCertApi,
} from '../api/ssl'
import { getApiError } from '../api/errors'
import { useCooldown } from '../hooks/useCooldown'
import { ChallengeType, CertType } from '../types/ssl'
import type { CertStatus, ChallengeInfo, IssuedCertificate, WildcardInfo, CertRecord, DomainWithCerts } from '../types/ssl'
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
  Trash2,
  Zap,
} from 'lucide-react'

const FQDN_REGEX = /^(\*\.)?([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/

// ── Local types ───────────────────────────────────────────────────────────────

type ChallengeState = ChallengeInfo & { certName: string }
interface CertState extends IssuedCertificate { certName: string }
interface WildcardChoiceState { certName: string; wildcard: WildcardInfo }

function isExpiringSoon(expiryDate?: string): boolean {
  if (!expiryDate) return false
  return new Date(expiryDate).getTime() - Date.now() < 30 * 24 * 60 * 60 * 1000
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function Certificates() {
  const qc = useQueryClient()

  // ── Form state
  const [showForm, setShowForm]       = useState(false)
  const [formCertName, setFormCertName] = useState('')
  const [formChallengeType, setFormChallengeType] = useState<ChallengeType>(ChallengeType.DNS_01)

  // ── Flow state (sequential steps)
  const [wildcardChoice, setWildcardChoice]             = useState<WildcardChoiceState | null>(null)
  const [challenge, setChallenge]                       = useState<ChallengeState | null>(null)
  const [challengeVerifiedCert, setChallengeVerifiedCert] = useState<string | null>(null)
  const [certificate, setCertificate]                   = useState<CertState | null>(null)
  const [copiedKey, setCopiedKey]                       = useState<string | null>(null)

  const [cooldowns, setCooldowns] = useState<Map<string, number>>(new Map())
  const startCooldown = useCallback((key: string, ms: number) => {
    setCooldowns(prev => new Map(prev).set(key, Date.now() + ms))
    setTimeout(() => setCooldowns(prev => { const n = new Map(prev); n.delete(key); return n }), ms)
  }, [])
  const isCooling = useCallback((key: string) => (cooldowns.get(key) ?? 0) > Date.now(), [cooldowns])

  const verifyCD = useCooldown(60_000)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['domains'],
    queryFn: getDomainsApi,
  })
  const domains: DomainWithCerts[] = data?.data.domains ?? []

  // ── Wildcard check (called on form submit before initiating)
  const checkMutation = useMutation({
    mutationFn: (certName: string) => checkWildcardApi(certName),
    onSuccess: (res, certName) => {
      if (res.data.covered && res.data.wildcard) {
        setWildcardChoice({ certName, wildcard: res.data.wildcard })
        setShowForm(false)
      } else {
        initiateMutation.mutate({ certName, challengeType: formChallengeType })
      }
    },
  })

  // ── Adopt wildcard (instant activation)
  const adoptMutation = useMutation({
    mutationFn: ({ certName, wildcardCertId }: { certName: string; wildcardCertId: string }) =>
      adoptWildcardApi(certName, wildcardCertId),
    onSuccess: (res, vars) => {
      setCertificate({ certName: vars.certName, ...res.data })
      setWildcardChoice(null)
      qc.invalidateQueries({ queryKey: ['domains'] })
    },
  })

  // ── ACME initiate
  const initiateMutation = useMutation({
    mutationFn: ({ certName, challengeType, skipWildcardCheck = false }: { certName: string; challengeType: ChallengeType; skipWildcardCheck?: boolean }) =>
      initiateSslApi(certName, challengeType, skipWildcardCheck),
    onSettled: (_, __, vars) => startCooldown(vars.certName, 45_000),
    onSuccess: (res, vars) => {
      setChallenge({ certName: vars.certName, ...res.data })
      setWildcardChoice(null)
      setShowForm(false)
      qc.invalidateQueries({ queryKey: ['domains'] })
    },
  })

  // ── Verify
  const verifyMutation = useMutation({
    mutationFn: (certName: string) => verifySslApi(certName),
    onSettled: () => verifyCD.start(),
    onSuccess: (_, certName) => {
      setChallengeVerifiedCert(certName)
      setChallenge(null)
      qc.invalidateQueries({ queryKey: ['domains'] })
    },
  })

  // ── Generate
  const generateMutation = useMutation({
    mutationFn: (certName: string) => generateSslApi(certName),
    onSuccess: (res, certName) => {
      setCertificate({ certName, ...res.data })
      setChallengeVerifiedCert(null)
      qc.invalidateQueries({ queryKey: ['domains'] })
    },
  })

  // ── Delete domain
  const deleteDomainMutation = useMutation({
    mutationFn: (id: string) => deleteDomainApi(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['domains'] }),
  })

  // ── Delete cert
  const deleteCertMutation = useMutation({
    mutationFn: (id: string) => deleteCertApi(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['domains'] }),
  })

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
    setFormCertName('')
    setWildcardChoice(null)
    setChallenge(null)
    setChallengeVerifiedCert(null)
    setCertificate(null)
    checkMutation.reset()
    adoptMutation.reset()
    initiateMutation.reset()
    verifyMutation.reset()
    generateMutation.reset()
  }

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (isCooling(formCertName)) return
    // Check wildcard coverage first; proceed to initiate if not covered
    checkMutation.mutate(formCertName)
  }

  const handleCertNameChange = (value: string) => {
    setFormCertName(value)
    if (value.startsWith('*.')) setFormChallengeType(ChallengeType.DNS_01)
  }

  const isWildcard    = formCertName.startsWith('*.')
  const isDomainValid = formCertName.length > 0 && FQDN_REGEX.test(formCertName)
  const activeFlow    = showForm || !!wildcardChoice || !!challenge || !!challengeVerifiedCert || !!certificate

  return (
    <main className="flex-1 p-5 lg:p-8 max-w-5xl w-full mx-auto space-y-5">

      {/* Header */}
      <div className="pt-1 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--c-text-1)' }}>Certificates</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--c-text-2)' }}>
            Issue and manage SSL certificates grouped by domain
          </p>
        </div>
        {!activeFlow && (
          <button onClick={() => setShowForm(true)} className="btn btn-primary btn-sm gap-2 shrink-0">
            <Plus className="w-4 h-4" />
            New Certificate
          </button>
        )}
      </div>

      {/* ── Step 1: Configure form ── */}
      {showForm && !wildcardChoice && !challenge && !certificate && (
        <div className="rounded-2xl p-6 sm:p-8" style={{ background: 'var(--c-card)', border: '1px solid var(--c-border)' }}>
          <StepIndicator step={1} />
          <div className="mt-6 mb-5">
            <h2 className="text-base font-bold" style={{ color: 'var(--c-text-1)' }}>New Certificate</h2>
            <p className="text-sm mt-1" style={{ color: 'var(--c-text-2)' }}>
              Enter the domain name and choose how to prove ownership.
            </p>
          </div>

          <form onSubmit={handleFormSubmit} className="space-y-5">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider mb-2 block" style={{ color: 'var(--c-text-3)' }}>
                Certificate Domain
              </label>
              <label
                className="input input-bordered flex items-center gap-2.5 w-full"
                htmlFor="certname-input"
                style={
                  formCertName && !isDomainValid
                    ? { borderColor: 'var(--c-error)' }
                    : formCertName && isDomainValid
                    ? { borderColor: 'var(--c-success)' }
                    : {}
                }
              >
                <Globe className="w-4 h-4 shrink-0" style={{ color: 'var(--c-text-3)' }} />
                <input
                  id="certname-input"
                  type="text"
                  value={formCertName}
                  onChange={(e) => handleCertNameChange(e.target.value)}
                  className="grow bg-transparent outline-none font-mono"
                  placeholder="idexa.app, *.idexa.app, api.idexa.app"
                  autoFocus
                />
                {formCertName && (
                  isDomainValid
                    ? <Check className="w-4 h-4 shrink-0 text-success" />
                    : <X className="w-4 h-4 shrink-0" style={{ color: 'var(--c-error)' }} />
                )}
              </label>
              {formCertName && !isDomainValid && (
                <p className="text-xs mt-1.5" style={{ color: 'var(--c-error)' }}>
                  Enter a valid domain — e.g. <span className="font-mono">example.com</span> or <span className="font-mono">*.example.com</span>
                </p>
              )}
              {isWildcard && isDomainValid && (
                <p className="text-xs mt-1.5" style={{ color: 'var(--c-text-3)' }}>
                  Wildcard — covers all direct subdomains (e.g. <span className="font-mono">app.example.com</span>, <span className="font-mono">api.example.com</span>).
                </p>
              )}
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-wider mb-3 block" style={{ color: 'var(--c-text-3)' }}>
                Verification Method
              </label>
              <div className="grid sm:grid-cols-2 gap-3">
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
                    Add a TXT record to your DNS. Supports wildcards and all domain types.
                  </p>
                  <p className="text-xs mt-2 font-medium" style={{ color: 'var(--c-text-3)' }}>Requires: DNS provider access</p>
                </button>

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
                    Serve a verification file on your web server. No DNS access needed.
                  </p>
                  <p className="text-xs mt-2 font-medium" style={{ color: 'var(--c-text-3)' }}>Requires: port 80 open · no wildcards</p>
                </button>
              </div>
              {isWildcard && (
                <p className="text-xs mt-2" style={{ color: 'var(--c-warning)' }}>
                  Wildcard certificates require DNS-01 per RFC 8555.
                </p>
              )}
            </div>

            {(checkMutation.isError || initiateMutation.isError) && (
              <div className="alert alert-error text-sm">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{getApiError(checkMutation.error ?? initiateMutation.error, 'Failed to initiate.')}</span>
              </div>
            )}

            <div className="flex gap-3 justify-end pt-1">
              <button type="button" onClick={handleReset} className="btn btn-ghost">Cancel</button>
              <button
                type="submit"
                disabled={!isDomainValid || checkMutation.isPending || initiateMutation.isPending || isCooling(formCertName)}
                className="btn btn-primary gap-2"
              >
                {(checkMutation.isPending || initiateMutation.isPending)
                  ? <><span className="loading loading-spinner loading-sm" /> Checking…</>
                  : <>Continue <ArrowRight className="w-4 h-4" /></>}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── Step 1.5: Wildcard coverage choice ── */}
      {wildcardChoice && (
        <WildcardChoiceCard
          choice={wildcardChoice}
          adoptPending={adoptMutation.isPending}
          initiatePending={initiateMutation.isPending}
          adoptError={adoptMutation.isError ? getApiError(adoptMutation.error, 'Adoption failed.') : null}
          initiateError={initiateMutation.isError ? getApiError(initiateMutation.error, 'Failed to initiate.') : null}
          onUseWildcard={() => adoptMutation.mutate({ certName: wildcardChoice.certName, wildcardCertId: wildcardChoice.wildcard.id })}
          onIssueDedicated={() => {
            setWildcardChoice(null)
            initiateMutation.mutate({ certName: wildcardChoice.certName, challengeType: formChallengeType, skipWildcardCheck: true })
          }}
          onReset={handleReset}
        />
      )}

      {/* ── Step 2: DNS/HTTP challenge ── */}
      {challenge && (
        <ChallengeCard
          challenge={challenge}
          copiedKey={copiedKey}
          verifyPending={verifyMutation.isPending}
          verifyIsCooling={verifyCD.isCooling}
          verifyCooldownLeft={verifyCD.secondsLeft}
          verifyError={verifyMutation.isError ? getApiError(verifyMutation.error, 'Verification failed.') : null}
          onCopy={handleCopy}
          onVerify={() => verifyMutation.mutate(challenge.certName)}
          onReset={handleReset}
        />
      )}

      {/* ── Step 3: Challenge verified ── */}
      {challengeVerifiedCert && (
        <ChallengeVerifiedCard
          certName={challengeVerifiedCert}
          generatePending={generateMutation.isPending}
          generateError={generateMutation.isError ? getApiError(generateMutation.error, 'Generation failed.') : null}
          onGenerate={() => generateMutation.mutate(challengeVerifiedCert)}
          onReset={handleReset}
        />
      )}

      {/* ── Step 4: Certificate issued ── */}
      {certificate && (
        <CertCard
          cert={certificate}
          copiedKey={copiedKey}
          onCopy={handleCopy}
          onDownload={handleDownload}
          onReset={handleReset}
        />
      )}

      {/* ── Domain groups ── */}
      {isError && (
        <div className="alert alert-error text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>Failed to load certificates.</span>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12">
          <span className="loading loading-spinner loading-md" style={{ color: 'var(--c-primary)' }} />
        </div>
      ) : domains.length === 0 ? (
        <div
          className="rounded-2xl text-center py-16"
          style={{ background: 'var(--c-card)', border: '1px solid var(--c-border)', color: 'var(--c-text-3)' }}
        >
          <ShieldCheck className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No certificates yet. Issue your first one.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {domains.map((domain) => (
            <DomainGroup
              key={domain._id}
              domain={domain}
              onDeleteDomain={(id) => {
                if (window.confirm(`Delete ${domain.name} and all its certificates?`)) {
                  deleteDomainMutation.mutate(id)
                }
              }}
              onDeleteCert={(id, name) => {
                if (window.confirm(`Delete certificate for ${name}?`)) {
                  deleteCertMutation.mutate(id)
                }
              }}
            />
          ))}
        </div>
      )}

    </main>
  )
}

// ── DomainGroup ───────────────────────────────────────────────────────────────

function DomainGroup({
  domain,
  onDeleteDomain,
  onDeleteCert,
}: {
  domain: DomainWithCerts
  onDeleteDomain: (id: string) => void
  onDeleteCert: (id: string, name: string) => void
}) {
  // Sort: wildcard first, then apex, then alphabetical single
  const sorted = [...domain.certs].sort((a, b) => {
    if (a.certType === CertType.WILDCARD && b.certType !== CertType.WILDCARD) return -1
    if (b.certType === CertType.WILDCARD && a.certType !== CertType.WILDCARD) return 1
    if (a.certType === CertType.APEX && b.certType !== CertType.APEX) return -1
    if (b.certType === CertType.APEX && a.certType !== CertType.APEX) return 1
    return a.certName.localeCompare(b.certName)
  })

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--c-card)', border: '1px solid var(--c-border)' }}>
      {/* Domain header */}
      <div
        className="flex items-center justify-between px-5 py-3"
        style={{ background: 'var(--c-surface)', borderBottom: '1px solid var(--c-border)' }}
      >
        <div className="flex items-center gap-2">
          <Globe className="w-3.5 h-3.5" style={{ color: 'var(--c-text-3)' }} />
          <span className="text-sm font-semibold font-mono" style={{ color: 'var(--c-text-1)' }}>{domain.name}</span>
          <span className="text-xs" style={{ color: 'var(--c-text-3)' }}>
            {domain.certs.length} {domain.certs.length === 1 ? 'cert' : 'certs'}
          </span>
        </div>
        <button
          onClick={() => onDeleteDomain(domain._id)}
          className="btn btn-ghost btn-xs gap-1 text-error opacity-60 hover:opacity-100"
        >
          <Trash2 className="w-3.5 h-3.5" />
          Delete all
        </button>
      </div>

      {/* Certificate rows */}
      {sorted.length === 0 ? (
        <p className="text-xs text-center py-6" style={{ color: 'var(--c-text-3)' }}>No certificates yet.</p>
      ) : (
        <div className="divide-y" style={{ borderColor: 'var(--c-border)' }}>
          {sorted.map((cert) => (
            <CertRow key={cert._id} cert={cert} onDelete={() => onDeleteCert(cert._id, cert.certName)} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── CertRow ───────────────────────────────────────────────────────────────────

function CertRow({ cert, onDelete }: { cert: CertRecord; onDelete: () => void }) {
  const expiring = isExpiringSoon(cert.expiryDate)

  return (
    <div className="flex items-center gap-3 px-5 py-3 hover:bg-[var(--c-surface)] transition-colors">
      {/* Indent visual for single/apex — wildcard is "parent" */}
      {cert.certType !== CertType.WILDCARD && (
        <div className="w-3 shrink-0" style={{ borderLeft: '2px solid var(--c-border)', height: '1rem' }} />
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            to={`/certs/${cert._id}`}
            className="font-mono text-sm hover:underline truncate"
            style={{ color: 'var(--c-primary)' }}
          >
            {cert.certName}
          </Link>
          <CertTypeBadge certType={cert.certType} />
          {cert.coveredByWildcardId && (
            <span className="badge badge-xs gap-1" style={{ background: 'var(--c-primary-soft)', color: 'var(--c-primary)', border: '1px solid var(--c-primary-mid)' }}>
              <Zap className="w-2.5 h-2.5" />
              via wildcard
            </span>
          )}
          <StatusBadge status={cert.status} expiring={expiring} />
          {cert.renewalError && (
            <span title={`Auto-renewal failed: ${cert.renewalError}`}>
              <AlertCircle className="w-3.5 h-3.5" style={{ color: 'var(--c-error)' }} />
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 mt-0.5">
          {cert.expiryDate && (
            <span className="text-xs" style={{ color: expiring ? 'var(--c-warning)' : 'var(--c-text-3)' }}>
              Expires {new Date(cert.expiryDate).toLocaleDateString()}
            </span>
          )}
          {cert.challengeType && (
            <span className="text-xs font-mono" style={{ color: 'var(--c-text-3)' }}>{cert.challengeType}</span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <Link to={`/certs/${cert._id}`} className="btn btn-ghost btn-xs btn-square">
          <ExternalLink className="w-3.5 h-3.5" style={{ color: 'var(--c-text-3)' }} />
        </Link>
        <button onClick={onDelete} className="btn btn-ghost btn-xs btn-square">
          <Trash2 className="w-3.5 h-3.5" style={{ color: 'var(--c-error)' }} />
        </button>
      </div>
    </div>
  )
}

// ── WildcardChoiceCard ────────────────────────────────────────────────────────

function WildcardChoiceCard({
  choice,
  adoptPending,
  initiatePending,
  adoptError,
  initiateError,
  onUseWildcard,
  onIssueDedicated,
  onReset,
}: {
  choice: WildcardChoiceState
  adoptPending: boolean
  initiatePending: boolean
  adoptError: string | null
  initiateError: string | null
  onUseWildcard: () => void
  onIssueDedicated: () => void
  onReset: () => void
}) {
  return (
    <div className="rounded-2xl p-6 sm:p-8" style={{ background: 'var(--c-card)', border: '1px solid var(--c-primary-mid)' }}>
      <div className="flex items-start gap-3 mb-5">
        <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0" style={{ background: 'var(--c-primary-soft)' }}>
          <Zap className="w-5 h-5" style={{ color: 'var(--c-primary)' }} />
        </div>
        <div>
          <h2 className="text-base font-bold" style={{ color: 'var(--c-text-1)' }}>Wildcard Already Covers This Domain</h2>
          <p className="text-sm mt-1" style={{ color: 'var(--c-text-2)' }}>
            Active wildcard{' '}
            <span className="font-mono font-semibold" style={{ color: 'var(--c-primary)' }}>{choice.wildcard.certName}</span>
            {' '}already covers{' '}
            <span className="font-mono font-semibold" style={{ color: 'var(--c-primary)' }}>{choice.certName}</span>.
            {choice.wildcard.expiryDate && (
              <> Expires {new Date(choice.wildcard.expiryDate).toLocaleDateString()}.</>
            )}
          </p>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-3 mb-5">
        {/* Use wildcard */}
        <button
          type="button"
          onClick={onUseWildcard}
          disabled={adoptPending || initiatePending}
          className="text-left rounded-xl p-4 border-2 transition-all"
          style={{ borderColor: 'var(--c-primary)', background: 'var(--c-primary-soft)' }}
        >
          <div className="flex items-center gap-2 mb-2">
            <Zap className="w-4 h-4" style={{ color: 'var(--c-primary)' }} />
            <span className="font-semibold text-sm" style={{ color: 'var(--c-text-1)' }}>Use Wildcard</span>
            <span className="badge badge-xs badge-success ml-auto">Instant</span>
          </div>
          <p className="text-xs leading-relaxed" style={{ color: 'var(--c-text-2)' }}>
            Reuse the wildcard certificate immediately. No DNS challenge needed. Cert renews with the wildcard.
          </p>
        </button>

        {/* Issue dedicated */}
        <button
          type="button"
          onClick={onIssueDedicated}
          disabled={adoptPending || initiatePending}
          className="text-left rounded-xl p-4 border-2 transition-all"
          style={{ borderColor: 'var(--c-border)', background: 'var(--c-surface)' }}
        >
          <div className="flex items-center gap-2 mb-2">
            <ShieldCheck className="w-4 h-4" style={{ color: 'var(--c-text-2)' }} />
            <span className="font-semibold text-sm" style={{ color: 'var(--c-text-1)' }}>Dedicated Cert</span>
          </div>
          <p className="text-xs leading-relaxed" style={{ color: 'var(--c-text-2)' }}>
            Issue a separate cert with its own key. Requires DNS/HTTP challenge. Independent renewal cycle.
          </p>
        </button>
      </div>

      {(adoptError || initiateError) && (
        <div className="alert alert-error mb-4 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{adoptError ?? initiateError}</span>
        </div>
      )}

      <button onClick={onReset} className="btn btn-ghost btn-sm gap-2" style={{ color: 'var(--c-text-2)' }}>
        <RotateCcw className="w-4 h-4" />
        Start over
      </button>
    </div>
  )
}

// ── ChallengeCard ─────────────────────────────────────────────────────────────

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
  const isDns = challenge.challengeType === ChallengeType.DNS_01

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
              {isDns ? 'DNS Challenge Required' : 'HTTP Challenge Required'}
            </h2>
            <span className="badge badge-sm badge-ghost font-mono">{challenge.challengeType}</span>
          </div>
          <p className="text-sm" style={{ color: 'var(--c-text-2)' }}>
            Prove you control <span className="font-semibold font-mono" style={{ color: 'var(--c-primary)' }}>{challenge.certName}</span>
            {isDns ? ' by adding a TXT record to your DNS.' : ' by serving a file on your web server.'}
          </p>
        </div>
      </div>

      {isDns && (
        <>
          <ol className="space-y-1.5 mb-4 text-xs" style={{ color: 'var(--c-text-2)' }}>
            <li className="flex gap-2"><span className="font-bold shrink-0" style={{ color: 'var(--c-primary)' }}>1.</span>Log in to your DNS provider (Cloudflare, Route 53, Namecheap, etc.)</li>
            <li className="flex gap-2"><span className="font-bold shrink-0" style={{ color: 'var(--c-primary)' }}>2.</span>Create a new <span className="font-mono font-semibold">TXT</span> record with the Name and Value below</li>
            <li className="flex gap-2"><span className="font-bold shrink-0" style={{ color: 'var(--c-primary)' }}>3.</span>Wait 1–5 minutes for DNS to propagate, then click Verify</li>
          </ol>
          <div className="rounded-xl p-5 space-y-5 font-mono text-sm" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-wider" style={{ color: 'var(--c-text-3)' }}>Record Type</span>
              <span className="badge badge-neutral font-mono text-xs">TXT</span>
            </div>
            {[
              { label: 'Name',  value: challenge.txtName,  key: 'dns-name',  color: 'var(--c-info)'   },
              { label: 'Value', value: challenge.txtValue, key: 'dns-value', color: 'var(--c-purple)' },
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
          <p className="text-xs mt-3" style={{ color: 'var(--c-text-3)' }}>
            Some providers require only the subdomain part (e.g. <span className="font-mono">_acme-challenge</span> instead of the full FQDN).
          </p>
        </>
      )}

      {!isDns && (
        <>
          <ol className="space-y-1.5 mb-4 text-xs" style={{ color: 'var(--c-text-2)' }}>
            <li className="flex gap-2"><span className="font-bold shrink-0" style={{ color: 'var(--c-primary)' }}>1.</span>Create the directory <span className="font-mono">/.well-known/acme-challenge/</span> inside your document root</li>
            <li className="flex gap-2"><span className="font-bold shrink-0" style={{ color: 'var(--c-primary)' }}>2.</span>Create a file named <span className="font-mono font-semibold">{challenge.token}</span> (no extension) with the File Content below</li>
            <li className="flex gap-2"><span className="font-bold shrink-0" style={{ color: 'var(--c-primary)' }}>3.</span>Confirm it loads at the Challenge URL over plain HTTP (port 80, not HTTPS)</li>
            <li className="flex gap-2"><span className="font-bold shrink-0" style={{ color: 'var(--c-primary)' }}>4.</span>Click Verify — Let's Encrypt will fetch the file</li>
          </ol>
          <div className="rounded-xl p-5 space-y-5 font-mono text-sm" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
            {[
              { label: 'Challenge URL', value: `http://${challenge.certName}/.well-known/acme-challenge/${challenge.token}`, key: 'http-url',     color: 'var(--c-info)'   },
              { label: 'File Content',  value: challenge.keyAuth,                                                              key: 'http-content', color: 'var(--c-purple)' },
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
          <p className="text-xs mt-3" style={{ color: 'var(--c-text-3)' }}>
            File must be plain text. HTTP→HTTPS redirects cause verification to fail.
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
          <RotateCcw className="w-4 h-4" /> Start over
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
            : <><ShieldCheck className="w-4 h-4" /> Verify Ownership</>}
        </button>
      </div>
    </div>
  )
}

// ── ChallengeVerifiedCard ─────────────────────────────────────────────────────

function ChallengeVerifiedCard({
  certName,
  generatePending,
  generateError,
  onGenerate,
  onReset,
}: {
  certName: string
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
            <span className="font-semibold font-mono" style={{ color: 'var(--c-primary)' }}>{certName}</span>.
            Generate the certificate to complete issuance.
          </p>
        </div>
      </div>

      <div className="rounded-xl px-4 py-3 mb-5 flex items-start gap-2.5" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
        <ArrowRight className="w-4 h-4 shrink-0 mt-0.5" style={{ color: 'var(--c-text-3)' }} />
        <p className="text-xs" style={{ color: 'var(--c-text-2)' }}>
          Clicking Generate creates a private key and CSR, then finalises the order.
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
          <RotateCcw className="w-4 h-4" /> Start over
        </button>
        <button className="btn btn-primary gap-2" disabled={generatePending} onClick={onGenerate}>
          {generatePending
            ? <><span className="loading loading-spinner loading-sm" /> Generating…</>
            : <><ShieldCheck className="w-4 h-4" /> Generate Certificate</>}
        </button>
      </div>
    </div>
  )
}

// ── CertCard ──────────────────────────────────────────────────────────────────

function CertCard({
  cert,
  copiedKey,
  onCopy,
  onDownload,
  onReset,
}: {
  cert: CertState
  copiedKey: string | null
  onCopy: (text: string, key: string) => void
  onDownload: (content: string, filename: string) => void
  onReset: () => void
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
            For <span className="font-semibold font-mono" style={{ color: 'var(--c-primary)' }}>{cert.certName}</span>.{' '}
            Save both files — private key shown only once.
          </p>
        </div>
      </div>
      <CertFiles cert={cert.cert} privKey={cert.key} certName={cert.certName} copiedKey={copiedKey} onCopy={onCopy} onDownload={onDownload} />
      <div className="mt-4 flex justify-end">
        <button onClick={onReset} className="btn btn-outline btn-sm gap-2">
          <Plus className="w-4 h-4" /> Issue another
        </button>
      </div>
    </div>
  )
}

// ── CertFiles ─────────────────────────────────────────────────────────────────

function CertFiles({
  cert, privKey, certName, copiedKey, onCopy, onDownload,
}: {
  cert: string
  privKey: string
  certName: string
  copiedKey: string | null
  onCopy: (text: string, key: string) => void
  onDownload: (content: string, filename: string) => void
}) {
  return (
    <>
      {[
        { label: 'Certificate', value: cert,    copyKey: 'cert', filename: `${certName}.crt`, color: 'var(--c-info)'   },
        { label: 'Private Key', value: privKey, copyKey: 'key',  filename: `${certName}.key`, color: 'var(--c-purple)' },
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
                <Download className="w-3.5 h-3.5" /> Download
              </button>
            </div>
          </div>
          <div className="rounded-xl p-4 font-mono text-xs overflow-x-auto" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', color }}>
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

// ── Badge components ──────────────────────────────────────────────────────────

function CertTypeBadge({ certType }: { certType: CertType }) {
  const map: Record<CertType, string> = {
    wildcard: 'wildcard',
    single:   'single',
    apex:     'apex',
  }
  return <span className="badge badge-sm badge-ghost font-mono">{map[certType]}</span>
}

function StatusBadge({ status, expiring }: { status: CertStatus; expiring?: boolean }) {
  if (status === 'active' && expiring) {
    return (
      <span className="badge badge-sm badge-warning gap-1">
        <AlertTriangle className="w-3 h-3" /> Expiring
      </span>
    )
  }
  const map: Record<CertStatus, { label: string; cls: string }> = {
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
                className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                style={{
                  background: done || active ? 'var(--c-primary)' : 'var(--c-surface-2)',
                  color: done || active ? '#fff' : 'var(--c-text-3)',
                }}
              >
                {done ? <Check className="w-3 h-3" /> : n}
              </div>
              <span className="text-xs font-medium hidden sm:block" style={{ color: active ? 'var(--c-text-1)' : done ? 'var(--c-text-2)' : 'var(--c-text-3)' }}>
                {label}
              </span>
            </div>
            {!last && (
              <div className="h-px w-4 sm:w-7 mx-1.5" style={{ background: step > n ? 'var(--c-primary)' : 'var(--c-border)' }} />
            )}
          </div>
        )
      })}
    </div>
  )
}
