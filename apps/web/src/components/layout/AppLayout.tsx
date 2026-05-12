import { Suspense } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useSelector } from '@tanstack/react-store'
import { authStore, setAccessToken } from '../../store/auth'
import { logoutApi } from '../../api/auth'
import { Shield, LayoutDashboard, ShieldCheck, LogOut, Menu } from 'lucide-react'

const NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/certificates', label: 'Certificates', icon: ShieldCheck },
]

export default function AppLayout() {
  const navigate = useNavigate()
  const isAuthenticated = useSelector(authStore, (s) => s.isAuthenticated)

  if (!isAuthenticated) return null

  const handleLogout = async () => {
    try { await logoutApi() } finally {
      setAccessToken(null)
      navigate('/login')
    }
  }

  return (
    <div className="drawer lg:drawer-open">
      <input id="sidebar-toggle" type="checkbox" className="drawer-toggle" />

      {/* ── Main Content ── */}
      <div className="drawer-content flex flex-col min-h-screen" style={{ background: 'var(--c-page)' }}>

        {/* Topbar */}
        <header
          className="navbar sticky top-0 z-10 px-4 lg:px-6 shrink-0"
          style={{
            background: 'var(--c-card)',
            borderBottom: '1px solid var(--c-border)',
            minHeight: '3.5rem',
          }}
        >
          <div className="navbar-start">
            <label htmlFor="sidebar-toggle" className="btn btn-ghost btn-sm lg:hidden">
              <Menu className="w-5 h-5" />
            </label>
          </div>
          <div className="navbar-end">
            <button onClick={handleLogout} className="btn btn-ghost btn-sm gap-2" style={{ color: 'var(--c-text-2)' }}>
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline text-sm">Logout</span>
            </button>
          </div>
        </header>

        <Suspense fallback={
          <div className="flex-1 flex items-center justify-center">
            <span className="loading loading-spinner loading-lg" style={{ color: 'var(--c-primary)' }}></span>
          </div>
        }>
          <Outlet />
        </Suspense>
      </div>

      {/* ── Sidebar ── */}
      <div className="drawer-side z-20">
        <label htmlFor="sidebar-toggle" aria-label="close sidebar" className="drawer-overlay" />
        <aside
          className="flex flex-col w-60 min-h-full"
          style={{ background: 'var(--c-card)', borderRight: '1px solid var(--c-border)' }}
        >
          {/* Logo */}
          <div className="p-5 flex items-center gap-3 shrink-0" style={{ borderBottom: '1px solid var(--c-border)' }}>
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center shadow-sm shrink-0"
              style={{ background: 'var(--c-primary)' }}
            >
              <Shield className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="font-bold text-sm leading-none" style={{ color: 'var(--c-text-1)' }}>SSL Pilot</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--c-text-3)' }}>Console</p>
            </div>
          </div>

          {/* Nav */}
          <nav className="flex-1 p-3 overflow-y-auto">
            <p
              className="px-3 py-2 text-xs font-semibold uppercase tracking-widest"
              style={{ color: 'var(--c-text-3)' }}
            >
              Navigation
            </p>
            <ul className="space-y-0.5 mt-1">
              {NAV.map(({ to, label, icon: Icon }) => (
                <li key={to}>
                  <NavLink
                    to={to}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                        isActive ? 'font-semibold' : 'hover:bg-base-200'
                      }`
                    }
                    style={({ isActive }) =>
                      isActive
                        ? {
                            background: 'var(--c-primary-soft)',
                            color: 'var(--c-primary)',
                            borderLeft: '2px solid var(--c-primary)',
                            paddingLeft: 'calc(0.75rem - 2px)',
                          }
                        : { color: 'var(--c-text-2)' }
                    }
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    {label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>

          {/* User */}
          <div className="p-4 shrink-0" style={{ borderTop: '1px solid var(--c-border)' }}>
            <div className="flex items-center gap-3">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                style={{
                  background: 'var(--c-primary-soft)',
                  color: 'var(--c-primary)',
                  border: '1px solid var(--c-primary-mid)',
                }}
              >
                A
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium leading-none truncate" style={{ color: 'var(--c-text-1)' }}>Admin</p>
                <p className="text-xs mt-1 truncate" style={{ color: 'var(--c-text-3)' }}>Administrator</p>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
