import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../lib/auth';

export default function Layout() {
  const { user, logout } = useAuth();

  return (
    <div className="app-layout">
      <header className="app-header no-print">
        <div className="app-header-inner">
          <div>
            <NavLink to="/" className="app-title">
              Ultrasound Ledger
            </NavLink>
            <span className="app-subtitle">Heritage Veterinary Hospital · Busselton</span>
          </div>
          <nav className="app-nav">
            <NavLink to="/" end className={({ isActive }) => (isActive ? 'active' : undefined)}>
              Dashboard
            </NavLink>
            <NavLink to="/cases" className={({ isActive }) => (isActive ? 'active' : undefined)}>
              Cases
            </NavLink>
            <NavLink to="/invoices" className={({ isActive }) => (isActive ? 'active' : undefined)}>
              Invoices
            </NavLink>
            <NavLink to="/payments" className={({ isActive }) => (isActive ? 'active' : undefined)}>
              Payments
            </NavLink>
            <NavLink to="/statement" className={({ isActive }) => (isActive ? 'active' : undefined)}>
              Statement
            </NavLink>
            <NavLink to="/settings" className={({ isActive }) => (isActive ? 'active' : undefined)}>
              Settings
            </NavLink>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => logout()}
              title={user?.username}
            >
              Sign out
            </button>
          </nav>
        </div>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
