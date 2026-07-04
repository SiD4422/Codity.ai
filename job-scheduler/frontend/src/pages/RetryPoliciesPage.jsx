import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useToast } from '../components/Toast';
import { EmptyState } from './QueuesPage';

export default function RetryPoliciesPage() {
  const [policies, setPolicies] = useState([]);
  const [showNew, setShowNew] = useState(false);
  const toast = useToast();

  async function load() {
    try {
      const { data } = await api.listRetryPolicies();
      setPolicies(data);
    } catch (err) {
      toast(err.message);
    }
  }
  useEffect(() => { load(); }, []);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: 26, margin: 0 }}>Retry Policies</h1>
        <button className="primary" style={{ marginLeft: 'auto' }} onClick={() => setShowNew(true)}>+ Policy</button>
      </div>
      <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 20, maxWidth: 560 }}>
        Reusable retry configurations. Attach one to a queue as its default, or override per-job when creating a job.
      </p>

      {showNew && <NewPolicyForm onCreated={() => { setShowNew(false); load(); }} onCancel={() => setShowNew(false)} />}

      {policies.length === 0 ? (
        <EmptyState title="No retry policies yet" body="Create one to define how failed jobs back off and retry — fixed, linear, or exponential delay." />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
          {policies.map(p => (
            <div key={p.id} style={{
              background: 'var(--bg-panel)', border: '1px solid var(--border-hair)', borderRadius: 'var(--radius-md)', padding: 16,
            }}>
              <div className="mono" style={{ fontSize: 14, fontWeight: 600 }}>{p.name}</div>
              <div style={{ fontSize: 12, color: 'var(--accent-violet)', marginTop: 4, textTransform: 'capitalize' }}>{p.strategy} backoff</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 10, lineHeight: 1.7 }}>
                max attempts: <b style={{ color: 'var(--text-primary)' }}>{p.max_attempts}</b><br />
                base delay: <b style={{ color: 'var(--text-primary)' }}>{p.base_delay_ms}ms</b><br />
                max delay: <b style={{ color: 'var(--text-primary)' }}>{p.max_delay_ms}ms</b><br />
                jitter: <b style={{ color: 'var(--text-primary)' }}>{p.jitter ? 'on' : 'off'}</b>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function NewPolicyForm({ onCreated, onCancel }) {
  const [form, setForm] = useState({
    name: '', strategy: 'exponential', maxAttempts: 5, baseDelayMs: 1000, maxDelayMs: 300000, jitter: true,
  });
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.createRetryPolicy(form);
      toast('Retry policy created', 'success');
      onCreated();
    } catch (err) {
      toast(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} style={{
      display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, alignItems: 'end',
      marginBottom: 20, padding: 14, background: 'var(--bg-panel)', border: '1px solid var(--border-hair)', borderRadius: 'var(--radius-md)',
    }}>
      <label>
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>Name</div>
        <input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} style={{ width: '100%' }} />
      </label>
      <label>
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>Strategy</div>
        <select value={form.strategy} onChange={e => setForm({ ...form, strategy: e.target.value })} style={{ width: '100%' }}>
          <option value="fixed">Fixed</option>
          <option value="linear">Linear</option>
          <option value="exponential">Exponential</option>
        </select>
      </label>
      <label>
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>Max attempts</div>
        <input type="number" min={0} value={form.maxAttempts} onChange={e => setForm({ ...form, maxAttempts: Number(e.target.value) })} style={{ width: '100%' }} />
      </label>
      <label>
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>Base delay (ms)</div>
        <input type="number" min={0} value={form.baseDelayMs} onChange={e => setForm({ ...form, baseDelayMs: Number(e.target.value) })} style={{ width: '100%' }} />
      </label>
      <label>
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>Max delay (ms)</div>
        <input type="number" min={0} value={form.maxDelayMs} onChange={e => setForm({ ...form, maxDelayMs: Number(e.target.value) })} style={{ width: '100%' }} />
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <input type="checkbox" checked={form.jitter} onChange={e => setForm({ ...form, jitter: e.target.checked })} />
        <span style={{ fontSize: 12 }}>Jitter</span>
      </label>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="primary" type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create'}</button>
        <button type="button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
