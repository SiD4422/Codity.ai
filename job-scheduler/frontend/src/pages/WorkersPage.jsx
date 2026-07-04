import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useProject } from '../api/ProjectContext';
import { useToast } from '../components/Toast';
import StatusBadge from '../components/StatusBadge';
import { EmptyState } from './QueuesPage';

export default function WorkersPage() {
  const { selectedId } = useProject();
  const [workers, setWorkers] = useState([]);
  const [loading, setLoading] = useState(true);
  const toast = useToast();

  async function load() {
    if (!selectedId) return;
    try {
      const { data } = await api.listWorkers(selectedId);
      setWorkers(data);
    } catch (err) {
      toast(err.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, [selectedId]);
  useEffect(() => { const t = setInterval(load, 3000); return () => clearInterval(t); }, [selectedId]);

  return (
    <div>
      <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: 26, marginBottom: 20 }}>Workers</h1>
      {loading && workers.length === 0 ? (
        <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>Loading workers…</div>
      ) : workers.length === 0 ? (
        <EmptyState title="No workers registered"
          body={<>Start one with: <code style={{ display: 'block', marginTop: 6 }}>PROJECT_ID=&lt;id&gt; npm run worker</code></>} />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 }}>
          {workers.map(w => (
            <div key={w.id} style={{
              background: 'var(--bg-panel)', border: '1px solid var(--border-hair)', borderRadius: 'var(--radius-md)', padding: 16,
            }}>
              <div className="mono" style={{ fontSize: 13, marginBottom: 6 }}>{w.hostname} · pid {w.pid}</div>
              <StatusBadge status={w.status} />
              <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-secondary)' }}>
                active jobs: <b style={{ color: 'var(--text-primary)' }}>{w.active_jobs}</b> / {w.max_concurrency}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 6 }}>
                last heartbeat: {w.last_heartbeat_at ? new Date(w.last_heartbeat_at).toLocaleTimeString() : '—'}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
