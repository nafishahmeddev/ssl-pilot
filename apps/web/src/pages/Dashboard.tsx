import { useState } from 'react'
import type { SyntheticEvent } from 'react'
import { useMutation } from '@tanstack/react-query'
import { setAccessToken } from '../store/auth'
import { useNavigate } from 'react-router-dom'
import { logoutApi } from '../api/auth'
import { initiateSslApi, verifySslApi } from '../api/ssl'
import { getApiError } from '../api/errors'
import type { IssuedCertificate } from '../types/ssl'
import {
  Shield,
  ShieldCheck,
  LayoutDashboard,
  Globe,
  LogOut,
  Menu,
  Copy,
  Check,
  AlertCircle,
  AlertTriangle,
  Download,
  RotateCcw,
} from 'lucide-react'

interface ChallengeState {
  domain: string
  txtName: string
  txtValue: string
}

interface CertState extends IssuedCertificate {
  domain: string
}

export default function Dashboard() {
  const [domain, setDomain] = useState('')
  const [challenge, setChallenge] = useState<ChallengeState | null>(null)
  const [certificate, setCertificate] = useState<CertState | null>(null)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const navigate = useNavigate()

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
    },
  })

  const handleLogout = async () => {
    try {
      await logoutApi()
    } finally {
      setAccessToken(null)
      navigate('/login')
    }
  }

  const handleInitiate = (e: SyntheticEvent) => {
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
    initiateMutation.reset()
    verifyMutation.reset()
  }

  return (
    <div className="drawer lg:drawer-open">
      <input id="sidebar-toggle" type="checkbox" className="drawer-toggle" />

      {/* ── Main Content ── */}
      <div className="drawer-content flex flex-col min-h-screen bg-base-200">

        {/* Topbar */}
        <header
          className="navbar sticky top-0 z-10 px-4 lg:px-6 border-b shrink-0"
          style={{ background: 'oklch(17% 0.025 265)', borderColor: 'oklch(26% 0.03 265 / 0.5)' }}
        >
          <div className="navbar-start gap-2">
            <label htmlFor="sidebar-toggle" className="btn btn-ghost btn-sm lg:hidden">
              <Menu className="w-5 h-5" />
            </label>
            <div className="breadcrumbs text-sm hidden sm:block">
              <ul>
                <li style={{ color: 'oklch(46% 0.02 265)' }}>SSL Pilot</li>
                <li className="font-medium">Dashboard</li>
              </ul>
            </div>
          </div>
          <div className="navbar-end">
            <button onClick={handleLogout} className="btn btn-ghost btn-sm gap-2">
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline text-sm">Logout</span>
            </button>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 p-5 lg:p-8 max-w-5xl w-full mx-auto space-y-6">

          {/* Page Header */}
          <div className="pt-1">
            <h1 className="text-2xl font-bold">Dashboard</h1>
            <p className="text-sm mt-1" style={{ color: 'oklch(52% 0.015 265)' }}>
              Manage and monitor your SSL certificates
            </p>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { icon: ShieldCheck, label: 'Total Certificates', value: '0', desc: 'No certificates yet', color: 'oklch(62% 0.26 265)', bg: 'oklch(62% 0.26 265 / 0.1)' },
              { icon: Check,       label: 'Active',             value: '0', desc: 'All clear',           color: 'oklch(70% 0.20 150)', bg: 'oklch(70% 0.20 150 / 0.1)' },
              { icon: AlertCircle, label: 'Expiring Soon',      value: '0', desc: 'Within 30 days',      color: 'oklch(78% 0.18 78)',  bg: 'oklch(78% 0.18 78 / 0.1)'  },
            ].map(({ icon: Icon, label, value, desc, color, bg }) => (
              <div key={label} className="card" style={{ background: 'oklch(17% 0.025 265)', border: '1px solid oklch(26% 0.03 265 / 0.5)' }}>
                <div className="card-body p-5 flex-row items-start gap-4">
                  <div className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0" style={{ background: bg }}>
                    <Icon className="w-5 h-5" style={{ color }} />
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: 'oklch(46% 0.02 265)' }}>{label}</p>
                    <p className="text-3xl font-bold leading-none" style={{ color }}>{value}</p>
                    <p className="text-xs mt-1.5" style={{ color: 'oklch(44% 0.015 265)' }}>{desc}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Issue Certificate Form — hidden once challenge or cert is showing */}
          {!challenge && !certificate && (
            <div className="card" style={{ background: 'oklch(17% 0.025 265)', border: '1px solid oklch(26% 0.03 265 / 0.5)' }}>
              <div className="card-body p-6 sm:p-8">
                <div className="mb-5">
                  <h2 className="text-lg font-bold">Issue New Certificate</h2>
                  <p className="text-sm mt-1" style={{ color: 'oklch(52% 0.015 265)' }}>
                    Enter a domain to begin the DNS-01 ACME challenge process
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
                    <button type="submit" disabled={initiateMutation.isPending} className="btn btn-primary shrink-0">
                      {initiateMutation.isPending ? <span className="loading loading-spinner" /> : 'Initiate'}
                    </button>
                  </div>
                  {initiateMutation.isError && (
                    <div className="alert alert-error mt-4 text-sm">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{getApiError(initiateMutation.error, 'Failed to initiate certificate process.')}</span>
                    </div>
                  )}
                </form>
              </div>
            </div>
          )}

          {/* DNS Challenge Card */}
          {challenge && (
            <div className="card" style={{ background: 'oklch(17% 0.025 265)', border: '1px solid oklch(78% 0.18 78 / 0.28)' }}>
              <div className="card-body p-6 sm:p-8">
                <div className="flex items-start gap-3 mb-6">
                  <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 mt-0.5" style={{ background: 'oklch(78% 0.18 78 / 0.1)' }}>
                    <AlertTriangle className="w-5 h-5" style={{ color: 'oklch(78% 0.18 78)' }} />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold">Action Required: DNS Challenge</h2>
                    <p className="text-sm mt-1" style={{ color: 'oklch(52% 0.015 265)' }}>
                      Add this TXT record to your DNS provider to verify ownership of{' '}
                      <span className="font-semibold" style={{ color: 'oklch(74% 0.20 196)' }}>{challenge.domain}</span>
                    </p>
                  </div>
                </div>

                <div className="rounded-xl p-5 space-y-5 font-mono text-sm" style={{ background: 'oklch(13% 0.02 265)', border: '1px solid oklch(22% 0.03 265 / 0.6)' }}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs uppercase tracking-wider" style={{ color: 'oklch(44% 0.02 265)' }}>Type</span>
                    <span className="badge badge-neutral font-mono text-xs">TXT</span>
                  </div>

                  {[
                    { label: 'Name',  value: challenge.txtName,  key: 'name',  color: 'oklch(74% 0.20 196)' },
                    { label: 'Value', value: challenge.txtValue, key: 'value', color: 'oklch(78% 0.18 300)' },
                  ].map(({ label, value, key, color }) => (
                    <div key={key} className="space-y-2">
                      <span className="text-xs uppercase tracking-wider" style={{ color: 'oklch(44% 0.02 265)' }}>{label}</span>
                      <div className="flex items-center gap-2">
                        <span className="flex-1 break-all text-sm" style={{ color }}>{value}</span>
                        <button onClick={() => handleCopy(value, key)} className="btn btn-ghost btn-xs btn-square shrink-0" title={`Copy ${label}`}>
                          {copiedKey === key
                            ? <Check className="w-3.5 h-3.5 text-success" />
                            : <Copy className="w-3.5 h-3.5" style={{ color: 'oklch(46% 0.02 265)' }} />}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <p className="text-xs mt-4" style={{ color: 'oklch(42% 0.015 265)' }}>
                  DNS propagation may take a few minutes after adding the record.
                </p>

                {verifyMutation.isError && (
                  <div className="alert alert-error mt-4 text-sm">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{getApiError(verifyMutation.error, 'Verification failed. Ensure the DNS record is propagated and try again.')}</span>
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
                      : <><ShieldCheck className="w-4 h-4" /> Verify & Issue</>}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Issued Certificate Card */}
          {certificate && (
            <div className="card" style={{ background: 'oklch(17% 0.025 265)', border: '1px solid oklch(70% 0.20 150 / 0.3)' }}>
              <div className="card-body p-6 sm:p-8">
                <div className="flex items-start gap-3 mb-6">
                  <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 mt-0.5" style={{ background: 'oklch(70% 0.20 150 / 0.12)' }}>
                    <ShieldCheck className="w-5 h-5" style={{ color: 'oklch(70% 0.20 150)' }} />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold">Certificate Issued</h2>
                    <p className="text-sm mt-1" style={{ color: 'oklch(52% 0.015 265)' }}>
                      SSL certificate for{' '}
                      <span className="font-semibold" style={{ color: 'oklch(74% 0.20 196)' }}>{certificate.domain}</span>
                      {' '}is ready. Save both files securely — the private key is shown only once.
                    </p>
                  </div>
                </div>

                {[
                  { label: 'Certificate', value: certificate.cert, copyKey: 'cert', filename: `${certificate.domain}.crt`, color: 'oklch(74% 0.20 196)' },
                  { label: 'Private Key',  value: certificate.key,  copyKey: 'key',  filename: `${certificate.domain}.key`, color: 'oklch(78% 0.18 300)' },
                ].map(({ label, value, copyKey, filename, color }) => (
                  <div key={copyKey} className="mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'oklch(50% 0.02 265)' }}>{label}</span>
                      <div className="flex gap-1">
                        <button onClick={() => handleCopy(value, copyKey)} className="btn btn-ghost btn-xs gap-1.5">
                          {copiedKey === copyKey ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
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
                    <RotateCcw className="w-4 h-4" />
                    Issue another certificate
                  </button>
                </div>
              </div>
            </div>
          )}

        </main>
      </div>

      {/* ── Sidebar ── */}
      <div className="drawer-side z-20">
        <label htmlFor="sidebar-toggle" aria-label="close sidebar" className="drawer-overlay" />
        <aside
          className="flex flex-col w-64 min-h-full"
          style={{ background: 'oklch(14% 0.025 265)', borderRight: '1px solid oklch(24% 0.03 265 / 0.5)' }}
        >
          <div className="p-5 flex items-center gap-3 shrink-0" style={{ borderBottom: '1px solid oklch(24% 0.03 265 / 0.5)' }}>
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shadow-md" style={{ background: 'oklch(62% 0.26 265)' }}>
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="font-bold text-sm leading-none">SSL Pilot</p>
              <p className="text-xs mt-0.5" style={{ color: 'oklch(44% 0.02 265)' }}>Certificate Manager</p>
            </div>
          </div>

          <nav className="flex-1 p-3 overflow-y-auto">
            <p className="px-3 py-2 text-xs font-semibold uppercase tracking-widest" style={{ color: 'oklch(38% 0.02 265)' }}>
              Navigation
            </p>
            <ul className="menu menu-sm p-0 gap-0.5">
              <li>
                <a className="active gap-3">
                  <LayoutDashboard className="w-4 h-4" />
                  Dashboard
                </a>
              </li>
              <li>
                <a className="gap-3 opacity-40 cursor-not-allowed" onClick={(e) => e.preventDefault()}>
                  <ShieldCheck className="w-4 h-4" />
                  Certificates
                  <span className="badge badge-sm ml-auto" style={{ fontSize: '0.6rem', lineHeight: 1 }}>Soon</span>
                </a>
              </li>
            </ul>
          </nav>

          <div className="p-4 shrink-0" style={{ borderTop: '1px solid oklch(24% 0.03 265 / 0.5)' }}>
            <div className="flex items-center gap-3">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                style={{ background: 'oklch(62% 0.26 265 / 0.18)', color: 'oklch(72% 0.18 265)', border: '1px solid oklch(62% 0.26 265 / 0.28)' }}
              >
                U
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium leading-none truncate">User</p>
                <p className="text-xs mt-1 truncate" style={{ color: 'oklch(44% 0.02 265)' }}>Administrator</p>
              </div>
            </div>
          </div>
        </aside>
      </div>

    </div>
  )
}
