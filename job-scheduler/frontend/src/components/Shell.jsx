import { NavLink, Outlet, useNavigate } from 'react-router-dom';

export default function Shell() {
  const navigate = useNavigate();

  function logout() {
    localStorage.removeItem('jobscheduler_token');
    navigate('/login');
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <aside style={{
        width: 220, borderRight: '1px solid var(--border-hair)', padding: '20px 16px',
        display: 'flex', flexDirection: 'column', gap: 4, background: 'var(--bg-panel)',
      }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--accent-teal)', marginBottom: 8, letterSpacing: 1 }}>
          SCHEDULER://
        </div>
        <NavItem to="/">Queues</NavItem>
        <NavItem to="/workers">Workers</NavItem>
        <NavItem to="/retry-policies">Retry Policies</NavItem>
        <div style={{ flex: 1 }} />
        <button onClick={logout} style={{ fontSize: 12 }}>Sign out</button>
      </aside>
      <main style={{ flex: 1, padding: 28, overflowX: 'auto' }}>
        <Outlet />
      </main>
    </div>
  );
}

function NavItem({ to, children }) {
  return (
    <NavLink to={to} end style={({ isActive }) => ({
      padding: '8px 10px', borderRadius: 6, fontSize: 14,
      color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
      background: isActive ? 'var(--bg-panel-alt)' : 'transparent',
      textDecoration: 'none',
    })}>
      {children}
    </NavLink>
  );
}
