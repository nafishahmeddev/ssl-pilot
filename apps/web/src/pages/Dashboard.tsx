import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { getCertificatesApi } from '../api/ssl'
import { ShieldCheck, Shield, XCircle, AlertCircle, ArrowRight } from 'lucide-react'
import type { DomainRecord, DomainStatus } from '../types/ssl'

interface StatDef {
  icon: React.ElementType
  label: string
  value: string
  desc: string
  color: string
  soft: string
}

function buildStats(certs: DomainRecord[], loading: boolean): StatDef[] {
  const v = (n: number) => (loading ? '—' : String(n))
  const total   = certs.length
  const active  = certs.filter((c) => c.status === 'active').length
  const expired = certs.filter((c) => c.status === 'expired').length

  return [
    {
      icon: Shield,
      label: 'Total',
      value: v(total),
      desc: total === 1 ? '1 domain tracked' : `${loading ? '—' : total} domains tracked`,
      color: 'var(--c-primary)',
      soft: 'var(--c-primary-soft)',
    },
    {
      icon: ShieldCheck,
      label: 'Active',
      value: v(active),
      desc: active === 0 ? 'None active' : 'Certificates valid',
      color: 'var(--c-success)',
      soft: 'var(--c-success-soft)',
    },
    {
      icon: XCircle,
      label: 'Expired',
      value: v(expired),
      desc: expired === 0 ? 'All clear' : 'Auto-renewal queued',
      color: 'var(--c-error)',
      soft: 'var(--c-error-soft)',
    },
  ]
}

export default function Dashboard() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['certificates'],
    queryFn: getCertificatesApi,
  })

  const certs = data?.data.certificates ?? []
  const stats = buildStats(certs, isLoading)
  const recent = certs.slice(0, 5)

  return (
    <main className="flex-1 p-5 lg:p-8 max-w-6xl w-full mx-auto space-y-5">

      <div className="pt-1">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--c-text-1)' }}>Dashboard</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--c-text-2)' }}>
          SSL certificate health overview
        </p>
      </div>

      {isError && (
        <div className="alert alert-error text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>Failed to load certificate data.</span>
        </div>
      )}

      {/* ── Bento Grid ── */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">

        {/* Featured: Total — wider, with domain list */}
        <div
          className="sm:col-span-2 rounded-2xl p-6 flex flex-col gap-5"
          style={{ background: 'var(--c-card)', border: '1px solid var(--c-border)' }}
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--c-text-3)' }}>
                Total Certificates
              </p>
              {isLoading ? (
                <span className="loading loading-dots loading-sm mt-2" style={{ color: 'var(--c-primary)' }} />
              ) : (
                <p className="text-5xl font-bold mt-2 leading-none" style={{ color: 'var(--c-primary)' }}>
                  {certs.length}
                </p>
              )}
            </div>
            <div
              className="w-11 h-11 rounded-2xl flex items-center justify-center"
              style={{ background: 'var(--c-primary-soft)' }}
            >
              <Shield className="w-5 h-5" style={{ color: 'var(--c-primary)' }} />
            </div>
          </div>

          {/* Recent domain list inline */}
          {!isLoading && certs.length > 0 && (
            <div className="space-y-2">
              {certs.slice(0, 3).map((c) => (
                <div
                  key={c._id}
                  className="flex items-center justify-between py-2 px-3 rounded-xl"
                  style={{ background: 'var(--c-surface)' }}
                >
                  <span className="font-mono text-xs" style={{ color: 'var(--c-text-1)' }}>{c.domainName}</span>
                  <StatusDot status={c.status} />
                </div>
              ))}
              {certs.length > 3 && (
                <Link
                  to="/certificates"
                  className="flex items-center gap-1 text-xs px-3"
                  style={{ color: 'var(--c-primary)' }}
                >
                  +{certs.length - 3} more <ArrowRight className="w-3 h-3" />
                </Link>
              )}
            </div>
          )}

          {!isLoading && certs.length === 0 && (
            <p className="text-sm" style={{ color: 'var(--c-text-3)' }}>
              No certificates yet.{' '}
              <Link to="/certificates" style={{ color: 'var(--c-primary)' }}>Issue one →</Link>
            </p>
          )}
        </div>

        {/* Active */}
        <StatCard stat={stats[1]} isLoading={isLoading} />

        {/* Expired */}
        <StatCard stat={stats[2]} isLoading={isLoading} />

      </div>

      {/* ── Recent Certs Table ── */}
      {!isLoading && recent.length > 0 && (
        <div
          className="rounded-2xl"
          style={{ background: 'var(--c-card)', border: '1px solid var(--c-border)' }}
        >
          <div className="flex items-center justify-between px-6 pt-5 pb-4" style={{ borderBottom: '1px solid var(--c-border)' }}>
            <h2 className="text-sm font-semibold" style={{ color: 'var(--c-text-1)' }}>Recent Certificates</h2>
            <Link
              to="/certificates"
              className="text-xs flex items-center gap-1"
              style={{ color: 'var(--c-primary)' }}
            >
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="table table-sm">
              <thead>
                <tr style={{ color: 'var(--c-text-3)', fontSize: '0.7rem' }}>
                  <th className="py-3">Domain</th>
                  <th>Status</th>
                  <th>Issued</th>
                  <th>Expires</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((cert) => (
                  <tr key={cert._id} className="hover">
                    <td>
                      <Link
                        to={`/certificates/${cert._id}`}
                        className="font-mono text-sm hover:underline"
                        style={{ color: 'var(--c-primary)' }}
                      >
                        {cert.domainName}
                      </Link>
                    </td>
                    <td><StatusBadge status={cert.status} /></td>
                    <td className="text-sm" style={{ color: 'var(--c-text-2)' }}>
                      {new Date(cert.createdAt).toLocaleDateString()}
                    </td>
                    <td className="text-sm" style={{ color: 'var(--c-text-2)' }}>
                      {cert.expiryDate ? new Date(cert.expiryDate).toLocaleDateString() : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </main>
  )
}

function StatCard({ stat, isLoading }: { stat: StatDef; isLoading: boolean }) {
  const { icon: Icon, label, value, desc, color, soft } = stat
  return (
    <div
      className="rounded-2xl p-6 flex flex-col gap-3"
      style={{ background: 'var(--c-card)', border: '1px solid var(--c-border)' }}
    >
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--c-text-3)' }}>
          {label}
        </p>
        <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: soft }}>
          <Icon className="w-4 h-4" style={{ color }} />
        </div>
      </div>
      {isLoading ? (
        <span className="loading loading-dots loading-sm" style={{ color }} />
      ) : (
        <p className="text-4xl font-bold leading-none" style={{ color }}>{value}</p>
      )}
      <p className="text-xs" style={{ color: 'var(--c-text-3)' }}>{desc}</p>
    </div>
  )
}

function StatusDot({ status }: { status: DomainStatus }) {
  const color: Record<DomainStatus, string> = {
    active:            'var(--c-success)',
    pending:           'var(--c-text-3)',
    pending_challenge: 'var(--c-warning)',
    expired:           'var(--c-error)',
    failed:            'var(--c-error)',
  }
  return <span className="w-2 h-2 rounded-full inline-block" style={{ background: color[status] }} />
}

function StatusBadge({ status }: { status: DomainStatus }) {
  const map: Record<DomainStatus, { label: string; cls: string }> = {
    active:            { label: 'Active',      cls: 'badge-success' },
    pending:           { label: 'Pending',     cls: 'badge-neutral' },
    pending_challenge: { label: 'DNS Pending', cls: 'badge-warning' },
    expired:           { label: 'Expired',     cls: 'badge-error' },
    failed:            { label: 'Failed',      cls: 'badge-error' },
  }
  const { label, cls } = map[status]
  return <span className={`badge badge-sm ${cls}`}>{label}</span>
}
