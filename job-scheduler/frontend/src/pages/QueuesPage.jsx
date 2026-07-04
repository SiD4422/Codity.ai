import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useProject } from '../api/ProjectContext';
import { useLiveStatus } from '../api/useLiveStatus';
import StatusBadge from '../components/StatusBadge';

export default function QueuesPage() {
  const { projects, selected, selectedId, select, refresh } = useProject();
  const [queues, setQueues] = useState([]);
  const [stats, setStats] = useState({});
  const [showNewProject, setShowNewProject] = useState(false);
  const [showNewQueue, setShowNewQueue] = useState(false);
  const live = useLiveStatus();

  async function loadQueues() {
    if (!selectedId) return;
    const { data } = await api.listQueues(selectedId);
    setQueues(data);
    const statMap = {};
    await Promise.all(data.map(async (q) => {
      const s = await api.queueStats(q.id);
      statMap[q.id] = s.data;
    }));
    setStats(statMap);
  }

  useEffect(() => { loadQueues(); }, [selectedId]);
  useEffect(() => { if (live) loadQueues(); }, [live?.timestamp]);

  if (projects.length === 0 && !showNewProject) {
    return (
      <EmptyState
        title="No projects yet"
        body="A project owns your queues, jobs, and workers. Create one to get started."
        action={<button className="primary" onClick={() => setShowNewProject(true)}>New project</button>}
      />
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: 26, margin: 0 }}>Queues</h1>
        <select value={selectedId} onChange={e => select(e.target.value)} style={{ marginLeft: 'auto' }}>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <button onClick={() => setShowNewProject(true)}>+ Project</button>
        <button className="primary" onClick={() => setShowNewQueue(true)}>+ Queue</button>
      </div>

      {selected && (
        <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 20, fontFamily: 'var(--font-mono)' }}>
          API key: {selected.api_key} — workers authenticate with PROJECT_ID={selected.id}
        </div>
      )}

      {showNewProject && (
        <NewProjectForm onCreated={() => { setShowNewProject(false); refresh(); }} onCancel={() => setShowNewProject(false)} />
      )}
      {showNewQueue && selectedId && (
        <NewQueueForm projectId={selectedId} onCreated={() => { setShowNewQueue(false); loadQueues(); }} onCancel={() => setShowNewQueue(false)} />
      )}

      {queues.length === 0 ? (
        <EmptyState title="No queues" body="Create a queue to start scheduling jobs against this project." />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {queues.map(q => <QueueCard key={q.id} queue={q} stats={stats[q.id]} onChange={loadQueues} />)}
        </div>
      )}
    </div>
  );
}

function QueueCard({ queue, stats, onChange }) {
  const counts = stats?.statusCounts || {};
  const dlqCount = counts.dead_letter || 0;

  async function toggle() {
    if (queue.state === 'active') await api.pauseQueue(queue.id);
    else await api.resumeQueue(queue.id);
    onChange();
  }

  return (
    <Link to={`/queues/${queue.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
      <div style={{
        background: 'var(--bg-panel)', border: '1px solid var(--border-hair)', borderRadius: 'var(--radius-md)',
        padding: 18, transition: 'border-color 0.15s',
      }}
      onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent-blue)'}
      onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-hair)'}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div className="mono" style={{ fontSize: 15, fontWeight: 600 }}>{queue.name}</div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>priority {queue.priority} · concurrency {queue.concurrency_limit}</div>
          </div>
          <StatusBadge status={queue.state} />
        </div>

        <div style={{ display: 'flex', gap: 14, marginTop: 16, fontSize: 12 }}>
          <Stat label="running" value={counts.running || 0} color="var(--accent-blue)" />
          <Stat label="done/hr" value={stats?.completedLastHour ?? 0} color="var(--accent-teal)" />
          <Stat label="dead letter" value={dlqCount} color={dlqCount > 0 ? 'var(--accent-red)' : 'var(--text-dim)'} />
        </div>

        <button onClick={(e) => { e.preventDefault(); toggle(); }} style={{ marginTop: 14, fontSize: 12, width: '100%' }}>
          {queue.state === 'active' ? 'Pause queue' : 'Resume queue'}
        </button>
      </div>
    </Link>
  );
}

function Stat({ label, value, color }) {
  return (
    <div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 700, color }}>{value}</div>
      <div style={{ color: 'var(--text-dim)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
    </div>
  );
}

function NewProjectForm({ onCreated, onCancel }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    await api.createProject({ name });
    setBusy(false);
    onCreated();
  }
  return (
    <PanelForm onSubmit={submit} onCancel={onCancel} busy={busy} submitLabel="Create project">
      <input autoFocus required placeholder="Project name" value={name} onChange={e => setName(e.target.value)} />
    </PanelForm>
  );
}

function NewQueueForm({ projectId, onCreated, onCancel }) {
  const [form, setForm] = useState({ name: '', priority: 0, concurrencyLimit: 5 });
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    await api.createQueue({ projectId, ...form });
    setBusy(false);
    onCreated();
  }
  return (
    <PanelForm onSubmit={submit} onCancel={onCancel} busy={busy} submitLabel="Create queue">
      <input autoFocus required placeholder="Queue name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
      <input type="number" placeholder="Priority" value={form.priority} onChange={e => setForm({ ...form, priority: Number(e.target.value) })} />
      <input type="number" placeholder="Concurrency limit" value={form.concurrencyLimit} onChange={e => setForm({ ...form, concurrencyLimit: Number(e.target.value) })} />
    </PanelForm>
  );
}

function PanelForm({ children, onSubmit, onCancel, busy, submitLabel }) {
  return (
    <form onSubmit={onSubmit} style={{
      display: 'flex', gap: 10, alignItems: 'center', marginBottom: 20, padding: 14,
      background: 'var(--bg-panel)', border: '1px solid var(--border-hair)', borderRadius: 'var(--radius-md)',
    }}>
      {children}
      <button className="primary" type="submit" disabled={busy}>{busy ? 'Working…' : submitLabel}</button>
      <button type="button" onClick={onCancel}>Cancel</button>
    </form>
  );
}

export function EmptyState({ title, body, action }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 10,
      padding: '48px 0', maxWidth: 420,
    }}>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 22 }}>{title}</div>
      <div style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.5 }}>{body}</div>
      {action}
    </div>
  );
}
