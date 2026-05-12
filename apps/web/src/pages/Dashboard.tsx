import { useQuery } from '@tanstack/react-query'
import { getCertificatesApi } from '../api/ssl'
import { ShieldCheck, Shield, AlertCircle, XCircle } from 'lucide-react'
import type { DomainRecord } from '../types/ssl'

interface StatCard {
  icon: React.ElementType
  label: string
  value: string
  desc: string
  color: string
  bg: string
}

function buildStats(certs: DomainRecord[], isLoading: boolean): StatCard[] {
  const total = certs.length
  const active = certs.filter((c) => c.status === 'active').length
  const expired = certs.filter((c) => c.status === 'expired').length

  const val = (n: number) => (isLoading ? '—' : String(n))

  return [
    {
      icon: Shield,
      label: 'Total Certificates',
      value: val(total),
      desc: total === 0 ? 'No certificates yet' : `${total} domain${total !== 1 ? 's' : ''}`,
      color: 'oklch(62% 0.26 265)',
      bg: 'oklch(62% 0.26 265 / 0.1)',
    },
    {
      icon: ShieldCheck,
      label: 'Active',
      value: val(active),
      desc: active === 0 ? 'None active' : `${active} valid`,
      color: 'oklch(70% 0.20 150)',
      bg: 'oklch(70% 0.20 150 / 0.1)',
    },
    {
      icon: XCircle,
      label: 'Expired',
      value: val(expired),
      desc: expired === 0 ? 'All clear' : 'Auto-renewal queued',
      color: 'oklch(65% 0.22 25)',
      bg: 'oklch(65% 0.22 25 / 0.1)',
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

  return (
    <main className="flex-1 p-5 lg:p-8 max-w-5xl w-full mx-auto space-y-6">
      <div className="pt-1">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm mt-1" style={{ color: 'oklch(52% 0.015 265)' }}>
          Overview of your SSL certificate health
        </p>
      </div>

      {isError && (
        <div className="alert alert-error text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>Failed to load certificate data.</span>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {stats.map(({ icon: Icon, label, value, desc, color, bg }) => (
          <div
            key={label}
            className="card"
            style={{ background: 'oklch(17% 0.025 265)', border: '1px solid oklch(26% 0.03 265 / 0.5)' }}
          >
            <div className="card-body p-5 flex-row items-start gap-4">
              <div
                className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0"
                style={{ background: bg }}
              >
                <Icon className="w-5 h-5" style={{ color }} />
              </div>
              <div>
                <p
                  className="text-xs font-semibold uppercase tracking-wider mb-1"
                  style={{ color: 'oklch(46% 0.02 265)' }}
                >
                  {label}
                </p>
                {isLoading ? (
                  <span className="loading loading-dots loading-sm" style={{ color }} />
                ) : (
                  <p className="text-3xl font-bold leading-none" style={{ color }}>{value}</p>
                )}
                <p className="text-xs mt-1.5" style={{ color: 'oklch(44% 0.015 265)' }}>{desc}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {!isLoading && certs.length > 0 && (
        <div
          className="card"
          style={{ background: 'oklch(17% 0.025 265)', border: '1px solid oklch(26% 0.03 265 / 0.5)' }}
        >
          <div className="card-body p-6">
            <h2 className="text-base font-bold mb-4">Recent Certificates</h2>
            <div className="overflow-x-auto">
              <table className="table table-sm">
                <thead>
                  <tr style={{ color: 'oklch(46% 0.02 265)' }}>
                    <th>Domain</th>
                    <th>Status</th>
                    <th>Issued</th>
                    <th>Expires</th>
                  </tr>
                </thead>
                <tbody>
                  {certs.slice(0, 5).map((cert) => (
                    <tr key={cert._id}>
                      <td className="font-mono text-sm">{cert.domainName}</td>
                      <td><StatusBadge status={cert.status} /></td>
                      <td className="text-sm" style={{ color: 'oklch(52% 0.015 265)' }}>
                        {new Date(cert.createdAt).toLocaleDateString()}
                      </td>
                      <td className="text-sm" style={{ color: 'oklch(52% 0.015 265)' }}>
                        {cert.expiryDate ? new Date(cert.expiryDate).toLocaleDateString() : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

function StatusBadge({ status }: { status: DomainRecord['status'] }) {
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
