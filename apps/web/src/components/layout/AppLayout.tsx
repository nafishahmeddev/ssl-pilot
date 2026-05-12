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

      <div className="drawer-content flex flex-col min-h-screen bg-base-200">
        <header
          className="navbar sticky top-0 z-10 px-4 lg:px-6 border-b shrink-0"
          style={{ background: 'oklch(17% 0.025 265)', borderColor: 'oklch(26% 0.03 265 / 0.5)' }}
        >
          <div className="navbar-start gap-2">
            <label htmlFor="sidebar-toggle" className="btn btn-ghost btn-sm lg:hidden">
              <Menu className="w-5 h-5" />
            </label>
          </div>
          <div className="navbar-end">
            <button onClick={handleLogout} className="btn btn-ghost btn-sm gap-2">
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline text-sm">Logout</span>
            </button>
          </div>
        </header>

        <Outlet />
      </div>

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
              {NAV.map(({ to, label, icon: Icon }) => (
                <li key={to}>
                  <NavLink
                    to={to}
                    className={({ isActive }) =>
                      `gap-3 ${isActive ? 'active' : ''}`
                    }
                  >
                    <Icon className="w-4 h-4" />
                    {label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>

          <div className="p-4 shrink-0" style={{ borderTop: '1px solid oklch(24% 0.03 265 / 0.5)' }}>
            <div className="flex items-center gap-3">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                style={{ background: 'oklch(62% 0.26 265 / 0.18)', color: 'oklch(72% 0.18 265)', border: '1px solid oklch(62% 0.26 265 / 0.28)' }}
              >
                A
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium leading-none truncate">Admin</p>
                <p className="text-xs mt-1 truncate" style={{ color: 'oklch(44% 0.02 265)' }}>Administrator</p>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
