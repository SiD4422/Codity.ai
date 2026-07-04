import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';

export default function LoginPage() {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ email: '', password: '', name: '', organizationName: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const fn = mode === 'login' ? api.login : api.register;
      const { token } = await fn(form);
      localStorage.setItem('jobscheduler_token', token);
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <form onSubmit={handleSubmit} style={{
        width: 380, background: 'var(--bg-panel)', border: '1px solid var(--border-hair)',
        borderRadius: 'var(--radius-md)', padding: 32,
      }}>
        <div style={{ marginBottom: 4, fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--accent-teal)', letterSpacing: 1 }}>
          SCHEDULER://AUTH
        </div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: 28, margin: '0 0 24px' }}>
          {mode === 'login' ? 'Sign in' : 'Create workspace'}
        </h1>

        {mode === 'register' && (
          <>
            <Field label="Your name">
              <input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="Organization name">
              <input required value={form.organizationName} onChange={e => setForm({ ...form, organizationName: e.target.value })} />
            </Field>
          </>
        )}
        <Field label="Email">
          <input required type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
        </Field>
        <Field label="Password">
          <input required type="password" minLength={8} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
        </Field>

        {error && <div style={{ color: 'var(--accent-red)', fontSize: 13, marginBottom: 16 }}>{error}</div>}

        <button className="primary" type="submit" disabled={loading} style={{ width: '100%', padding: '10px 0' }}>
          {loading ? 'Working…' : mode === 'login' ? 'Sign in' : 'Create workspace'}
        </button>

        <div style={{ marginTop: 16, fontSize: 13, color: 'var(--text-secondary)', textAlign: 'center' }}>
          {mode === 'login' ? (
            <>No workspace yet? <a onClick={() => setMode('register')} style={{ cursor: 'pointer' }}>Create one</a></>
          ) : (
            <>Already have an account? <a onClick={() => setMode('login')} style={{ cursor: 'pointer' }}>Sign in</a></>
          )}
        </div>
      </form>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: 'block', marginBottom: 14 }}>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>{label}</div>
      <div style={{ display: 'block' }}>
        {children}
      </div>
      <style>{`label input { width: 100%; }`}</style>
    </label>
  );
}
