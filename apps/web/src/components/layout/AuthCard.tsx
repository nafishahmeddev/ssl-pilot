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
    <div className="min-h-screen flex">

      {/* ── Left Brand Panel ── */}
      <div
        className="hidden lg:flex lg:w-[460px] xl:w-[520px] relative flex-col justify-between p-12 shrink-0"
        style={{ background: 'oklch(14% 0.025 265)', borderRight: '1px solid oklch(24% 0.03 265 / 0.6)' }}
      >
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: 'oklch(62% 0.26 265)' }}
          >
            <Shield className="w-5 h-5 text-white" />
          </div>
          <span className="text-xl font-bold" style={{ color: 'oklch(90% 0.01 265)' }}>
            SSL Pilot
          </span>
        </div>

        {/* Hero copy */}
        <div className="space-y-8">
          <div>
            <h2
              className="text-[2.4rem] font-bold leading-tight mb-4"
              style={{ color: 'oklch(94% 0.01 265)' }}
            >
              Certificate management, simplified.
            </h2>
            <p className="text-base leading-relaxed" style={{ color: 'oklch(58% 0.02 265)' }}>
              Provision, monitor, and renew SSL certificates across all your domains — from a single elegant dashboard.
            </p>
          </div>

          <div className="space-y-3.5">
            {brandFeatures.map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-3">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                  style={{
                    background: 'oklch(20% 0.03 265)',
                    border: '1px solid oklch(30% 0.03 265 / 0.6)',
                  }}
                >
                  <Icon className="w-4 h-4" style={{ color: 'oklch(62% 0.26 265)' }} />
                </div>
                <span className="text-sm" style={{ color: 'oklch(68% 0.02 265)' }}>{text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Footer tagline */}
        <p className="text-xs" style={{ color: 'oklch(38% 0.02 265)' }}>
          Trusted by engineering teams worldwide
        </p>
      </div>

      {/* ── Right Form Panel ── */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 sm:p-10 lg:p-12 bg-base-200">

        {/* Mobile logo */}
        <div className="lg:hidden flex items-center gap-3 mb-8 self-start w-full max-w-md">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center"
            style={{ background: 'oklch(62% 0.26 265)' }}
          >
            <Shield className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-lg">SSL Pilot</span>
        </div>

        <div className="w-full max-w-md">
          <div className="mb-7">
            <h1 className="text-2xl font-bold mb-1.5">{title}</h1>
            <p className="text-sm" style={{ color: 'oklch(52% 0.015 265)' }}>{subtitle}</p>
          </div>
          {children}
          <p className="text-center mt-7 text-sm" style={{ color: 'oklch(50% 0.015 265)' }}>
            {footer}
          </p>
        </div>
      </div>

    </div>
  )
}
