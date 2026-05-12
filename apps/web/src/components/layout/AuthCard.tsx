import type { ReactNode } from 'react'
import { Shield, Bell, Zap } from 'lucide-react'

interface AuthCardProps {
  title: string
  subtitle: string
  children: ReactNode
  footer: ReactNode
}

const brandFeatures = [
  { icon: Shield, text: 'Automated certificate provisioning' },
  { icon: Bell,   text: 'Expiry alerts & real-time monitoring' },
  { icon: Zap,    text: 'One-click DNS verification' },
]

export function AuthCard({ title, subtitle, children, footer }: AuthCardProps) {
  return (
    <div className="min-h-screen flex" style={{ background: 'var(--c-page)' }}>

      {/* ── Left Console Panel ── */}
      <div
        className="hidden lg:flex lg:w-[440px] xl:w-[500px] relative flex-col justify-between p-12 shrink-0"
        style={{ background: 'oklch(13% 0.06 158)', borderRight: '1px solid oklch(22% 0.08 158)' }}
      >
        {/* Top: Logo */}
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: 'var(--c-primary)' }}
          >
            <Shield className="w-5 h-5 text-white" />
          </div>
          <span className="text-xl font-bold" style={{ color: 'oklch(94% 0.02 158)' }}>
            SSL Pilot
          </span>
        </div>

        {/* Middle: Hero */}
        <div className="space-y-8">
          <div>
            <p
              className="text-xs font-mono uppercase tracking-widest mb-4"
              style={{ color: 'var(--c-primary)' }}
            >
              Console v1.0
            </p>
            <h2
              className="text-[2.2rem] font-bold leading-tight mb-4"
              style={{ color: 'oklch(92% 0.02 158)' }}
            >
              Certificate management, simplified.
            </h2>
            <p className="text-sm leading-relaxed" style={{ color: 'oklch(60% 0.04 158)' }}>
              Provision, monitor, and renew SSL certificates across all your domains from a single dashboard.
            </p>
          </div>

          <div className="space-y-3">
            {brandFeatures.map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-3">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: 'var(--c-primary-soft)', border: '1px solid oklch(60% 0.17 158 / 0.25)' }}
                >
                  <Icon className="w-4 h-4" style={{ color: 'var(--c-primary)' }} />
                </div>
                <span className="text-sm" style={{ color: 'oklch(68% 0.04 158)' }}>{text}</span>
              </div>
            ))}
          </div>

          {/* Console-style status line */}
          <div
            className="rounded-xl p-4 font-mono text-xs space-y-1.5"
            style={{ background: 'oklch(9% 0.04 158)', border: '1px solid oklch(20% 0.06 158)' }}
          >
            <p style={{ color: 'oklch(55% 0.04 158)' }}>$ ssl-pilot status</p>
            <p style={{ color: 'var(--c-primary)' }}>✓ ACME provider connected</p>
            <p style={{ color: 'var(--c-primary)' }}>✓ Renewal scheduler active</p>
            <p style={{ color: 'oklch(55% 0.04 158)' }}>$ _</p>
          </div>
        </div>

        {/* Bottom tagline */}
        <p className="text-xs font-mono" style={{ color: 'oklch(38% 0.04 158)' }}>
          Trusted by engineering teams worldwide
        </p>
      </div>

      {/* ── Right Form Panel ── */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 sm:p-10 lg:p-16">

        {/* Mobile logo */}
        <div className="lg:hidden flex items-center gap-3 mb-10 self-start w-full max-w-md">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ background: 'var(--c-primary)' }}
          >
            <Shield className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-lg" style={{ color: 'var(--c-text-1)' }}>SSL Pilot</span>
        </div>

        <div className="w-full max-w-[380px]">
          <div className="mb-8">
            <h1 className="text-2xl font-bold mb-1.5" style={{ color: 'var(--c-text-1)' }}>{title}</h1>
            <p className="text-sm" style={{ color: 'var(--c-text-2)' }}>{subtitle}</p>
          </div>

          {children}

          <p className="text-center mt-8 text-sm" style={{ color: 'var(--c-text-2)' }}>
            {footer}
          </p>
        </div>
      </div>

    </div>
  )
}
