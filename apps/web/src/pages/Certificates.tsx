import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getCertificatesApi, initiateSslApi, verifySslApi } from '../api/ssl'
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
} from 'lucide-react'

interface ChallengeState {
  domain: string
  txtName: string
  txtValue: string
}

interface CertState extends IssuedCertificate {
  domain: string
}

export default function Certificates() {
  const qc = useQueryClient()
  const [domain, setDomain] = useState('')
  const [challenge, setChallenge] = useState<ChallengeState | null>(null)
  const [certificate, setCertificate] = useState<CertState | null>(null)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['certificates'],
    queryFn: getCertificatesApi,
  })

  const certs = data?.data.certificates ?? []

  const initiateMutation = useMutation({
    mutationFn: (d: string) => initiateSslApi(d),
    onSuccess: (res) => {
      setChallenge({ domain, txtName: res.data.txtName, txtValue: res.data.txtValue })
      setCertificate(null)
    },
  })

  const verifyMutation = useMutation({
    mutationFn: (d: string) => verifySslApi(d),
    onSuccess: (res) => {
      setCertificate({ ...res.data, domain: challenge!.domain })
      setChallenge(null)
      qc.invalidateQueries({ queryKey: ['certificates'] })
    },
  })

  const handleInitiate = (e: React.FormEvent) => {
    e.preventDefault()
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
    setChallenge(null)
    setCertificate(null)
    setDomain('')
    setShowForm(false)
    initiateMutation.reset()
    verifyMutation.reset()
  }

  return (
    <main className="flex-1 p-5 lg:p-8 max-w-5xl w-full mx-auto space-y-6">
      <div className="pt-1 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Certificates</h1>
          <p className="text-sm mt-1" style={{ color: 'oklch(52% 0.015 265)' }}>
            Issue and manage SSL certificates for your domains
          </p>
        </div>
        {!showForm && !challenge && !certificate && (
          <button
            onClick={() => setShowForm(true)}
            className="btn btn-primary btn-sm gap-2 shrink-0"
          >
            <Plus className="w-4 h-4" />
            New Certificate
          </button>
        )}
      </div>

      {/* Issue Form */}
      {showForm && !challenge && !certificate && (
        <div
          className="card"
          style={{ background: 'oklch(17% 0.025 265)', border: '1px solid oklch(26% 0.03 265 / 0.5)' }}
        >
          <div className="card-body p-6 sm:p-8">
            <div className="mb-5">
              <h2 className="text-lg font-bold">Issue New Certificate</h2>
              <p className="text-sm mt-1" style={{ color: 'oklch(52% 0.015 265)' }}>
                Enter a domain to begin the DNS-01 ACME challenge
              </p>
            </div>
            <form onSubmit={handleInitiate}>
              <div className="flex flex-col sm:flex-row gap-3">
                <label className="input input-bordered flex items-center gap-2.5 flex-1" htmlFor="domain-input">
                  <Globe className="w-4 h-4 shrink-0" style={{ color: 'oklch(44% 0.02 265)' }} />
                  <input
                    id="domain-input"
                    type="text"
                    value={domain}
                    onChange={(e) => setDomain(e.target.value)}
                    className="grow bg-transparent outline-none"
                    placeholder="example.com"
                    required
                  />
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleReset}
                    className="btn btn-ghost shrink-0"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={initiateMutation.isPending}
                    className="btn btn-primary shrink-0"
                  >
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

      {/* DNS Challenge Card */}
      {challenge && (
        <div
          className="card"
          style={{ background: 'oklch(17% 0.025 265)', border: '1px solid oklch(78% 0.18 78 / 0.28)' }}
        >
          <div className="card-body p-6 sm:p-8">
            <div className="flex items-start gap-3 mb-6">
              <div
                className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 mt-0.5"
                style={{ background: 'oklch(78% 0.18 78 / 0.1)' }}
              >
                <AlertTriangle className="w-5 h-5" style={{ color: 'oklch(78% 0.18 78)' }} />
              </div>
              <div>
                <h2 className="text-lg font-bold">Action Required: DNS Challenge</h2>
                <p className="text-sm mt-1" style={{ color: 'oklch(52% 0.015 265)' }}>
                  Add this TXT record to verify ownership of{' '}
                  <span className="font-semibold" style={{ color: 'oklch(74% 0.20 196)' }}>
                    {challenge.domain}
                  </span>
                </p>
              </div>
            </div>

            <div
              className="rounded-xl p-5 space-y-5 font-mono text-sm"
              style={{ background: 'oklch(13% 0.02 265)', border: '1px solid oklch(22% 0.03 265 / 0.6)' }}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-wider" style={{ color: 'oklch(44% 0.02 265)' }}>Type</span>
                <span className="badge badge-neutral font-mono text-xs">TXT</span>
              </div>
              {[
                { label: 'Name', value: challenge.txtName, key: 'name', color: 'oklch(74% 0.20 196)' },
                { label: 'Value', value: challenge.txtValue, key: 'value', color: 'oklch(78% 0.18 300)' },
              ].map(({ label, value, key, color }) => (
                <div key={key} className="space-y-2">
                  <span className="text-xs uppercase tracking-wider" style={{ color: 'oklch(44% 0.02 265)' }}>{label}</span>
                  <div className="flex items-center gap-2">
                    <span className="flex-1 break-all text-sm" style={{ color }}>{value}</span>
                    <button
                      onClick={() => handleCopy(value, key)}
                      className="btn btn-ghost btn-xs btn-square shrink-0"
                      title={`Copy ${label}`}
                    >
                      {copiedKey === key
                        ? <Check className="w-3.5 h-3.5 text-success" />
                        : <Copy className="w-3.5 h-3.5" style={{ color: 'oklch(46% 0.02 265)' }} />}
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <p className="text-xs mt-4" style={{ color: 'oklch(42% 0.015 265)' }}>
              DNS propagation may take a few minutes. Click verify once the record is set.
            </p>

            {verifyMutation.isError && (
              <div className="alert alert-error mt-4 text-sm">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{getApiError(verifyMutation.error, 'Verification failed. Ensure the DNS record has propagated.')}</span>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3 justify-between mt-4">
              <button onClick={handleReset} className="btn btn-ghost btn-sm gap-2">
                <RotateCcw className="w-4 h-4" />
                Start over
              </button>
              <button
                className="btn btn-success gap-2"
                disabled={verifyMutation.isPending}
                onClick={() => verifyMutation.mutate(challenge.domain)}
              >
                {verifyMutation.isPending
                  ? <><span className="loading loading-spinner loading-sm" /> Verifying…</>
                  : <><ShieldCheck className="w-4 h-4" /> Verify &amp; Issue</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Issued Certificate Card */}
      {certificate && (
        <div
          className="card"
          style={{ background: 'oklch(17% 0.025 265)', border: '1px solid oklch(70% 0.20 150 / 0.3)' }}
        >
          <div className="card-body p-6 sm:p-8">
            <div className="flex items-start gap-3 mb-6">
              <div
                className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 mt-0.5"
                style={{ background: 'oklch(70% 0.20 150 / 0.12)' }}
              >
                <ShieldCheck className="w-5 h-5" style={{ color: 'oklch(70% 0.20 150)' }} />
              </div>
              <div>
                <h2 className="text-lg font-bold">Certificate Issued</h2>
                <p className="text-sm mt-1" style={{ color: 'oklch(52% 0.015 265)' }}>
                  SSL certificate for{' '}
                  <span className="font-semibold" style={{ color: 'oklch(74% 0.20 196)' }}>
                    {certificate.domain}
                  </span>{' '}
                  is ready. Save both files — the private key is shown only once.
                </p>
              </div>
            </div>

            {[
              { label: 'Certificate', value: certificate.cert, copyKey: 'cert', filename: `${certificate.domain}.crt`, color: 'oklch(74% 0.20 196)' },
              { label: 'Private Key', value: certificate.key, copyKey: 'key', filename: `${certificate.domain}.key`, color: 'oklch(78% 0.18 300)' },
            ].map(({ label, value, copyKey, filename, color }) => (
              <div key={copyKey} className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'oklch(50% 0.02 265)' }}>
                    {label}
                  </span>
                  <div className="flex gap-1">
                    <button onClick={() => handleCopy(value, copyKey)} className="btn btn-ghost btn-xs gap-1.5">
                      {copiedKey === copyKey
                        ? <Check className="w-3.5 h-3.5 text-success" />
                        : <Copy className="w-3.5 h-3.5" />}
                      {copiedKey === copyKey ? 'Copied' : 'Copy'}
                    </button>
                    <button onClick={() => handleDownload(value, filename)} className="btn btn-ghost btn-xs gap-1.5">
                      <Download className="w-3.5 h-3.5" />
                      Download
                    </button>
                  </div>
                </div>
                <div
                  className="rounded-xl p-4 font-mono text-xs overflow-x-auto"
                  style={{ background: 'oklch(13% 0.02 265)', border: '1px solid oklch(22% 0.03 265 / 0.6)', color }}
                >
                  <pre className="whitespace-pre-wrap break-all">
                    {value.trim().split('\n').slice(0, 4).join('\n')}
                    {value.trim().split('\n').length > 4 && '\n…'}
                  </pre>
                </div>
              </div>
            ))}

            <div className="mt-2 flex justify-end">
              <button onClick={handleReset} className="btn btn-outline btn-sm gap-2">
                <Plus className="w-4 h-4" />
                Issue another certificate
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Certificates Table */}
      <div
        className="card"
        style={{ background: 'oklch(17% 0.025 265)', border: '1px solid oklch(26% 0.03 265 / 0.5)' }}
      >
        <div className="card-body p-6">
          <h2 className="text-base font-bold mb-4">All Domains</h2>
          {isLoading ? (
            <div className="flex justify-center py-8">
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
                    <th>Domain</th>
                    <th>Status</th>
                    <th>Issued</th>
                    <th>Expires</th>
                  </tr>
                </thead>
                <tbody>
                  {certs.map((cert) => (
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
          )}
        </div>
      </div>
    </main>
  )
}

function StatusBadge({ status }: { status: DomainRecord['status'] }) {
  const map: Record<DomainRecord['status'], { label: string; cls: string }> = {
    active: { label: 'Active', cls: 'badge-success' },
    pending: { label: 'Pending', cls: 'badge-neutral' },
    pending_challenge: { label: 'Challenge', cls: 'badge-warning' },
    expired: { label: 'Expired', cls: 'badge-error' },
    failed: { label: 'Failed', cls: 'badge-error' },
  }
  const { label, cls } = map[status]
  return <span className={`badge badge-sm ${cls}`}>{label}</span>
}
