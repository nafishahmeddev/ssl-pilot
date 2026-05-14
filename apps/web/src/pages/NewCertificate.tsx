import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  initiateSslApi,
  verifySslApi,
  generateSslApi,
  checkWildcardApi,
  adoptWildcardApi,
} from '../api/ssl'
import { getApiError } from '../api/errors'
import { useCooldown } from '../hooks/useCooldown'
import { ChallengeType } from '../types/ssl'
import type { ChallengeInfo, IssuedCertificate, WildcardInfo } from '../types/ssl'
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
  ArrowRight,
  ArrowLeft,
  Info,
  Zap,
} from 'lucide-react'

const FQDN_REGEX = /^(\*\.)?([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/

type ChallengesState = { certName: string; challenges: ChallengeInfo[] }
interface CertState extends IssuedCertificate { certName: string }
interface WildcardChoiceState { certName: string; wildcard: WildcardInfo }

function certTypeFromName(n: string): 'wildcard' | 'apex' | 'single' {
  if (n.startsWith('*.')) return 'wildcard'
  return n.split('.').length === 2 ? 'apex' : 'single'
}

function dnsRelativeLabel(txtName: string, certName: string): string {
  const domain = certName.startsWith('*.') ? certName.slice(2) : certName
  const parts  = domain.split('.')
  const root   = parts.slice(-2).join('.')
  return txtName.endsWith(`.${root}`) ? txtName.slice(0, -(root.length + 1)) : txtName
}

function certCoverageDesc(n: string): string {
  if (n.startsWith('*.')) {
    const base = n.slice(2)
    return `Covers all direct subdomains — e.g. app.${base}, api.${base}`
  }
  if (n.split('.').length === 2) return `Root domain only — does not cover subdomains like www.${n}`
  return `Single certificate — covers only ${n}`
}

function CertTypePill({ name }: { name: string }) {
  const type = certTypeFromName(name)
  const cfg = {
    wildcard: { label: 'Wildcard', bg: 'var(--c-primary-soft)', color: 'var(--c-primary)' },
    apex:     { label: 'Apex',     bg: 'var(--c-info-soft)',    color: 'var(--c-info)'    },
    single:   { label: 'Single',   bg: 'var(--c-success-soft)', color: 'var(--c-success)' },
  }[type]
  return (
    <span className="badge badge-sm font-mono shrink-0" style={{ background: cfg.bg, color: cfg.color, border: 'none' }}>
      {cfg.label}
    </span>
  )
}

export default function NewCertificate() {
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [formCertName, setFormCertName]     = useState('')
  const [wildcardChoice, setWildcardChoice] = useState<WildcardChoiceState | null>(null)
  const [challenges, setChallenges]         = useState<ChallengesState | null>(null)
  const [challengeVerifiedCert, setChallengeVerifiedCert] = useState<string | null>(null)
  const [certificate, setCertificate]             = useState<CertState | null>(null)
  const [copiedKey, setCopiedKey]                 = useState<string | null>(null)

  const [cooldowns, setCooldowns] = useState<Map<string, number>>(new Map())
  const startCooldown = useCallback((key: string, ms: number) => {
    setCooldowns(prev => new Map(prev).set(key, Date.now() + ms))
    setTimeout(() => setCooldowns(prev => { const n = new Map(prev); n.delete(key); return n }), ms)
  }, [])
  const isCooling = useCallback((key: string) => (cooldowns.get(key) ?? 0) > Date.now(), [cooldowns])

  const verifyCD = useCooldown(60_000)

  const checkMutation = useMutation({
    mutationFn: (certName: string) => checkWildcardApi(certName),
    onSuccess: (res, certName) => {
      if (res.data.covered && res.data.wildcard) {
        setWildcardChoice({ certName, wildcard: res.data.wildcard })
      } else {
        initiateMutation.mutate({ certName })
      }
    },
  })

  const adoptMutation = useMutation({
    mutationFn: ({ certName, wildcardCertId }: { certName: string; wildcardCertId: string }) =>
      adoptWildcardApi(certName, wildcardCertId),
    onSuccess: (res, vars) => {
      setCertificate({ certName: vars.certName, ...res.data })
      setWildcardChoice(null)
      qc.invalidateQueries({ queryKey: ['domains'] })
    },
  })

  const initiateMutation = useMutation({
    mutationFn: ({ certName, skipWildcardCheck = false }: { certName: string; skipWildcardCheck?: boolean }) =>
      initiateSslApi(certName, skipWildcardCheck),
    onSettled: (_, __, vars) => startCooldown(vars.certName, 45_000),
    onSuccess: (res, vars) => {
      setChallenges({ certName: vars.certName, challenges: res.data.challenges })
      setWildcardChoice(null)
      qc.invalidateQueries({ queryKey: ['domains'] })
    },
  })

  const verifyMutation = useMutation({
    mutationFn: ({ certName, challengeType }: { certName: string; challengeType: ChallengeType }) =>
      verifySslApi(certName, challengeType),
    onSettled: () => verifyCD.start(),
    onSuccess: (_, vars) => {
      setChallengeVerifiedCert(vars.certName)
      setChallenges(null)
      qc.invalidateQueries({ queryKey: ['domains'] })
    },
  })

  const generateMutation = useMutation({
    mutationFn: (certName: string) => generateSslApi(certName),
    onSuccess: (res, certName) => {
      setCertificate({ certName, ...res.data })
      setChallengeVerifiedCert(null)
      qc.invalidateQueries({ queryKey: ['domains'] })
    },
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

  const handleBack = () => navigate('/certificates')

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (isCooling(formCertName)) return
    checkMutation.mutate(formCertName)
  }

  const handleCertNameChange = (value: string) => {
    setFormCertName(value)
  }

  const isDomainValid = formCertName.length > 0 && FQDN_REGEX.test(formCertName)
  const showForm      = !wildcardChoice && !challenges && !challengeVerifiedCert && !certificate

  return (
    <main className="flex-1 p-5 lg:p-8 max-w-3xl w-full mx-auto space-y-5">

      <div className="pt-1 flex items-center gap-3">
        <button
          onClick={handleBack}
          className="btn btn-ghost btn-sm btn-square"
          aria-label="Back to certificates"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--c-text-1)' }}>New Certificate</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--c-text-2)' }}>
            Issue a free SSL certificate via Let's Encrypt
          </p>
        </div>
      </div>

      {/* ── Step 1: Configure ── */}
      {showForm && (
        <div className="rounded-2xl p-6 sm:p-8" style={{ background: 'var(--c-card)', border: '1px solid var(--c-border)' }}>
          <StepIndicator step={1} />
          <div className="mt-6 mb-5">
            <h2 className="text-base font-bold" style={{ color: 'var(--c-text-1)' }}>Configure Certificate</h2>
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
                  placeholder="idexa.app · *.idexa.app · api.idexa.app"
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
              {formCertName && isDomainValid && (
                <div className="mt-2 flex items-center gap-2 flex-wrap">
                  <CertTypePill name={formCertName} />
                  <span className="text-xs" style={{ color: 'var(--c-text-3)' }}>
                    {certCoverageDesc(formCertName)}
                  </span>
                </div>
              )}
            </div>

            <div className="flex items-start gap-2 px-1">
              <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: 'var(--c-text-3)' }} />
              <p className="text-xs" style={{ color: 'var(--c-text-3)' }}>
                After continuing, Let's Encrypt will return all available challenge methods for this domain.
                You'll pick whichever one you can complete.
              </p>
            </div>

            {(checkMutation.isError || initiateMutation.isError) && (
              <div className="alert alert-error text-sm">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{getApiError(checkMutation.error ?? initiateMutation.error, 'Failed to initiate.')}</span>
              </div>
            )}

            <div className="flex gap-3 justify-end pt-1">
              <button type="button" onClick={handleBack} className="btn btn-ghost">Cancel</button>
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
            initiateMutation.mutate({ certName: wildcardChoice.certName, skipWildcardCheck: true })
          }}
          onReset={handleBack}
        />
      )}

      {/* ── Step 2: Prove ownership ── */}
      {challenges && (
        <ChallengeCard
          state={challenges}
          copiedKey={copiedKey}
          verifyPending={verifyMutation.isPending}
          verifyIsCooling={verifyCD.isCooling}
          verifyCooldownLeft={verifyCD.secondsLeft}
          verifyError={verifyMutation.isError ? getApiError(verifyMutation.error, 'Verification failed.') : null}
          onCopy={handleCopy}
          onVerify={(challengeType) => verifyMutation.mutate({ certName: challenges.certName, challengeType })}
          onReset={handleBack}
        />
      )}

      {/* ── Step 3: Challenge verified ── */}
      {challengeVerifiedCert && (
        <ChallengeVerifiedCard
          certName={challengeVerifiedCert}
          generatePending={generateMutation.isPending}
          generateError={generateMutation.isError ? getApiError(generateMutation.error, 'Generation failed.') : null}
          onGenerate={() => generateMutation.mutate(challengeVerifiedCert)}
          onReset={handleBack}
        />
      )}

      {/* ── Step 4: Certificate issued ── */}
      {certificate && (
        <CertCard
          cert={certificate}
          copiedKey={copiedKey}
          onCopy={handleCopy}
          onDownload={handleDownload}
          onDone={handleBack}
        />
      )}

    </main>
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
  const expiryStr = choice.wildcard.expiryDate
    ? `Expires ${new Date(choice.wildcard.expiryDate).toLocaleDateString()}`
    : null

  return (
    <div className="rounded-2xl p-6 sm:p-8" style={{ background: 'var(--c-card)', border: '1px solid var(--c-primary-mid)' }}>
      <div className="flex items-start gap-3 mb-2">
        <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0" style={{ background: 'var(--c-primary-soft)' }}>
          <Zap className="w-5 h-5" style={{ color: 'var(--c-primary)' }} />
        </div>
        <div>
          <h2 className="text-base font-bold" style={{ color: 'var(--c-text-1)' }}>Wildcard Already Covers This Domain</h2>
          <p className="text-sm mt-1" style={{ color: 'var(--c-text-2)' }}>
            <span className="font-mono font-semibold" style={{ color: 'var(--c-primary)' }}>{choice.wildcard.certName}</span>
            {' '}covers{' '}
            <span className="font-mono font-semibold" style={{ color: 'var(--c-primary)' }}>{choice.certName}</span>
            {expiryStr && <> — {expiryStr}</>}.
          </p>
        </div>
      </div>

      <p className="text-xs mb-5 ml-13 pl-1" style={{ color: 'var(--c-text-3)' }}>
        Choose how you want to handle this:
      </p>

      <div className="grid sm:grid-cols-2 gap-3 mb-5">
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
            <span className="badge badge-xs badge-success ml-auto">Instant · No DNS needed</span>
          </div>
          <p className="text-xs leading-relaxed" style={{ color: 'var(--c-text-2)' }}>
            Copy the wildcard certificate immediately. No verification required. Renews automatically with the wildcard.
          </p>
        </button>

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
            Issue a dedicated certificate with its own ACME order. Let's Encrypt will provide available challenge methods. Independent renewal cycle.
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
        Cancel
      </button>
    </div>
  )
}

// ── ChallengeCard ─────────────────────────────────────────────────────────────

function ChallengeCard({
  state,
  copiedKey,
  verifyPending,
  verifyIsCooling,
  verifyCooldownLeft,
  verifyError,
  onCopy,
  onVerify,
  onReset,
}: {
  state: ChallengesState
  copiedKey: string | null
  verifyPending: boolean
  verifyIsCooling: boolean
  verifyCooldownLeft: number
  verifyError: string | null
  onCopy: (text: string, key: string) => void
  onVerify: (challengeType: ChallengeType) => void
  onReset: () => void
}) {
  const [activeVerifyType, setActiveVerifyType] = useState<ChallengeType | null>(null)

  const handleVerify = (ct: ChallengeType) => {
    setActiveVerifyType(ct)
    onVerify(ct)
  }

  return (
    <div className="rounded-2xl p-6 sm:p-8" style={{ background: 'var(--c-card)', border: '1px solid oklch(72% 0.19 80 / 0.35)' }}>
      <StepIndicator step={2} />
      <div className="flex items-start gap-3 mt-6 mb-5">
        <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0" style={{ background: 'var(--c-warning-soft)' }}>
          <AlertTriangle className="w-5 h-5" style={{ color: 'var(--c-warning)' }} />
        </div>
        <div>
          <h2 className="text-base font-bold" style={{ color: 'var(--c-text-1)' }}>Prove Domain Ownership</h2>
          <p className="text-sm" style={{ color: 'var(--c-text-2)' }}>
            Complete <strong>any one</strong> of the challenges below to verify you control{' '}
            <span className="font-semibold font-mono" style={{ color: 'var(--c-primary)' }}>{state.certName}</span>.
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {state.challenges.map((ch) => {
          const isDns = ch.challengeType === ChallengeType.DNS_01
          const isThisVerifying = verifyPending && activeVerifyType === ch.challengeType

          return (
            <div key={ch.challengeType} className="rounded-xl p-5" style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
              <div className="flex items-center gap-2 mb-4">
                <span className="badge badge-sm badge-ghost font-mono">{ch.challengeType}</span>
                <span className="text-xs font-semibold" style={{ color: 'var(--c-text-2)' }}>
                  {isDns ? 'DNS TXT Record' : 'HTTP File Challenge'}
                </span>
              </div>

              {isDns && ch.challengeType === ChallengeType.DNS_01 && (
                <>
                  <div className="space-y-2 mb-4">
                    {[
                      { n: 1, text: 'Log in to your DNS provider (Cloudflare, Route 53, Namecheap, etc.)' },
                      { n: 2, text: <span>Add a new <span className="font-mono font-semibold">TXT</span> record using the Name and Value below</span> },
                      { n: 3, text: 'Wait for DNS to propagate (usually 1–10 min), then click Verify' },
                    ].map(({ n, text }) => (
                      <div key={n} className="flex items-start gap-2.5">
                        <span className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5" style={{ background: 'var(--c-primary-soft)', color: 'var(--c-primary)' }}>
                          {n}
                        </span>
                        <p className="text-xs" style={{ color: 'var(--c-text-2)' }}>{text}</p>
                      </div>
                    ))}
                  </div>

                  <div className="rounded-xl p-4 space-y-4 font-mono text-sm mb-3" style={{ background: 'var(--c-card)', border: '1px solid var(--c-border)' }}>
                    <div className="flex items-center justify-between">
                      <span className="text-xs uppercase tracking-wider" style={{ color: 'var(--c-text-3)' }}>Record Type</span>
                      <span className="badge badge-neutral font-mono text-xs">TXT</span>
                    </div>
                    {[
                      { label: 'Name',  value: ch.txtName,  key: 'dns-name',  color: 'var(--c-info)'   },
                      { label: 'Value', value: ch.txtValue, key: 'dns-value', color: 'var(--c-purple)' },
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

                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 mb-3">
                    <p className="text-xs" style={{ color: 'var(--c-text-3)' }}>
                      If your provider auto-appends your root domain, use{' '}
                      <span className="font-mono font-semibold">{dnsRelativeLabel(ch.txtName, state.certName)}</span>{' '}
                      instead of the full FQDN.
                    </p>
                    <a
                      href={`https://dnschecker.org/#TXT/${ch.txtName}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs whitespace-nowrap shrink-0"
                      style={{ color: 'var(--c-primary)' }}
                    >
                      <ExternalLink className="w-3 h-3" />
                      Check DNS propagation
                    </a>
                  </div>
                </>
              )}

              {!isDns && ch.challengeType === ChallengeType.HTTP_01 && (
                <>
                  <div className="space-y-2 mb-4">
                    {[
                      { n: 1, text: <span>Create the directory <span className="font-mono">/.well-known/acme-challenge/</span> in your web root</span> },
                      { n: 2, text: <span>Create a file named <span className="font-mono font-semibold">{ch.token}</span> (no extension) with the File Content below</span> },
                      { n: 3, text: 'Confirm it loads over plain HTTP (not HTTPS) on port 80' },
                      { n: 4, text: "Click Verify — Let's Encrypt will fetch it" },
                    ].map(({ n, text }) => (
                      <div key={n} className="flex items-start gap-2.5">
                        <span className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5" style={{ background: 'var(--c-primary-soft)', color: 'var(--c-primary)' }}>
                          {n}
                        </span>
                        <p className="text-xs" style={{ color: 'var(--c-text-2)' }}>{text}</p>
                      </div>
                    ))}
                  </div>

                  <div className="rounded-xl p-4 space-y-4 font-mono text-sm mb-3" style={{ background: 'var(--c-card)', border: '1px solid var(--c-border)' }}>
                    {[
                      { label: 'Challenge URL', value: `http://${state.certName}/.well-known/acme-challenge/${ch.token}`, key: 'http-url',     color: 'var(--c-info)'   },
                      { label: 'File Content',  value: ch.keyAuth,                                                         key: 'http-content', color: 'var(--c-purple)' },
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
                  <p className="text-xs mb-3" style={{ color: 'var(--c-text-3)' }}>
                    File must be plain text. HTTP→HTTPS redirects will cause verification to fail.
                  </p>
                </>
              )}

              <div className="flex justify-end">
                <button
                  className="btn btn-primary btn-sm gap-2"
                  disabled={verifyPending || verifyIsCooling}
                  onClick={() => handleVerify(ch.challengeType)}
                >
                  {isThisVerifying
                    ? <><span className="loading loading-spinner loading-xs" /> Verifying…</>
                    : verifyIsCooling
                    ? <><ShieldCheck className="w-3.5 h-3.5" /> Wait {verifyCooldownLeft}s</>
                    : <><ShieldCheck className="w-3.5 h-3.5" /> Verify with {ch.challengeType}</>}
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {verifyError && (
        <div className="alert alert-error mt-4 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{verifyError}</span>
        </div>
      )}

      <div className="mt-5">
        <button onClick={onReset} className="btn btn-ghost btn-sm gap-2" style={{ color: 'var(--c-text-2)' }}>
          <RotateCcw className="w-4 h-4" /> Cancel
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
        <Info className="w-4 h-4 shrink-0 mt-0.5" style={{ color: 'var(--c-text-3)' }} />
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
          <RotateCcw className="w-4 h-4" /> Cancel
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
  onDone,
}: {
  cert: CertState
  copiedKey: string | null
  onCopy: (text: string, key: string) => void
  onDownload: (content: string, filename: string) => void
  onDone: () => void
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

      <div className="mt-4 flex flex-col sm:flex-row gap-3 justify-between">
        <button onClick={onDone} className="btn btn-ghost btn-sm gap-2" style={{ color: 'var(--c-text-2)' }}>
          <ArrowLeft className="w-4 h-4" /> Back to Certificates
        </button>
        <button onClick={onDone} className="btn btn-outline btn-sm gap-2">
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

// ── StepIndicator ─────────────────────────────────────────────────────────────

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
