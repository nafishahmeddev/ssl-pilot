import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getDomainsApi, deleteDomainApi, deleteCertApi } from '../api/ssl'
import { CertType } from '../types/ssl'
import type { CertStatus, CertRecord, DomainWithCerts } from '../types/ssl'
import {
  Globe,
  ShieldCheck,
  AlertTriangle,
  AlertCircle,
  ExternalLink,
  Trash2,
  Zap,
  Plus,
  Download,
} from 'lucide-react'

function isExpiringSoon(expiryDate?: string): boolean {
  if (!expiryDate) return false
  return new Date(expiryDate).getTime() - Date.now() < 30 * 24 * 60 * 60 * 1000
}

export default function Certificates() {
  const qc = useQueryClient()

  const { data, isLoading, isError } = useQuery({
    queryKey: ['domains'],
    queryFn: getDomainsApi,
  })
  const domains: DomainWithCerts[] = data?.data.domains ?? []

  const deleteDomainMutation = useMutation({
    mutationFn: (id: string) => deleteDomainApi(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['domains'] }),
  })

  const deleteCertMutation = useMutation({
    mutationFn: (id: string) => deleteCertApi(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['domains'] }),
  })

  return (
    <main className="flex-1 p-5 lg:p-8 max-w-5xl w-full mx-auto space-y-5">

      <div className="pt-1 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--c-text-1)' }}>Certificates</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--c-text-2)' }}>
            Issue and manage SSL certificates grouped by domain
          </p>
        </div>
        <Link to="/certificates/new" className="btn btn-primary btn-sm gap-2 shrink-0">
          <Plus className="w-4 h-4" />
          New Certificate
        </Link>
      </div>

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
        <EmptyState />
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

// ── EmptyState ────────────────────────────────────────────────────────────────

function EmptyState() {
  const steps = [
    {
      n: 1,
      icon: Globe,
      title: 'Enter your domain',
      desc: 'Type any domain — example.com, *.example.com, or api.example.com.',
    },
    {
      n: 2,
      icon: ShieldCheck,
      title: 'Prove ownership',
      desc: "Add a DNS TXT record or serve a file on your web server. Let's Encrypt verifies it.",
    },
    {
      n: 3,
      icon: Download,
      title: 'Get your certificate',
      desc: 'Download the PEM certificate and private key, then install on your server.',
    },
  ]

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--c-card)', border: '1px solid var(--c-border)' }}>
      <div className="text-center pt-12 pb-6 px-6">
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
          style={{ background: 'var(--c-primary-soft)', border: '1px solid var(--c-primary-mid)' }}
        >
          <ShieldCheck className="w-7 h-7" style={{ color: 'var(--c-primary)' }} />
        </div>
        <h2 className="text-base font-bold mb-1" style={{ color: 'var(--c-text-1)' }}>No certificates yet</h2>
        <p className="text-sm" style={{ color: 'var(--c-text-2)' }}>
          Issue your first free SSL certificate in 3 steps.
        </p>
      </div>

      <div className="grid sm:grid-cols-3 gap-px mx-6 mb-6" style={{ background: 'var(--c-border)' }}>
        {steps.map(({ n, icon: Icon, title, desc }) => (
          <div key={n} className="p-5" style={{ background: 'var(--c-surface)' }}>
            <div className="flex items-center gap-2 mb-3">
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                style={{ background: 'var(--c-primary-soft)', color: 'var(--c-primary)' }}
              >
                {n}
              </div>
              <Icon className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--c-text-3)' }} />
              <span className="text-xs font-semibold" style={{ color: 'var(--c-text-1)' }}>{title}</span>
            </div>
            <p className="text-xs leading-relaxed" style={{ color: 'var(--c-text-3)' }}>{desc}</p>
          </div>
        ))}
      </div>

      <div className="text-center pb-10">
        <Link to="/certificates/new" className="btn btn-primary gap-2">
          <Plus className="w-4 h-4" /> Issue first certificate
        </Link>
      </div>
    </div>
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
  const sorted = [...domain.certs].sort((a, b) => {
    if (a.certType === CertType.WILDCARD && b.certType !== CertType.WILDCARD) return -1
    if (b.certType === CertType.WILDCARD && a.certType !== CertType.WILDCARD) return 1
    if (a.certType === CertType.APEX && b.certType !== CertType.APEX) return -1
    if (b.certType === CertType.APEX && a.certType !== CertType.APEX) return 1
    return a.certName.localeCompare(b.certName)
  })

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--c-card)', border: '1px solid var(--c-border)' }}>
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
