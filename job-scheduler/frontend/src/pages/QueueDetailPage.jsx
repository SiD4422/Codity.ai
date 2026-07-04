import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../api/client';
import StatusBadge from '../components/StatusBadge';
import { EmptyState } from './QueuesPage';

const TABS = ['Jobs', 'Dead letter', 'New job'];

export default function QueueDetailPage() {
  const { queueId } = useParams();
  const [tab, setTab] = useState('Jobs');

  return (
    <div>
      <Link to="/" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>&larr; Queues</Link>
      <div style={{ display: 'flex', gap: 4, margin: '16px 0 20px' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            border: 'none', borderRadius: 0, borderBottom: tab === t ? '2px solid var(--accent-blue)' : '2px solid transparent',
            background: 'transparent', color: tab === t ? 'var(--text-primary)' : 'var(--text-secondary)',
            padding: '8px 4px', marginRight: 16,
          }}>{t}</button>
        ))}
      </div>
      {tab === 'Jobs' && <JobExplorer queueId={queueId} />}
      {tab === 'Dead letter' && <DlqPanel queueId={queueId} />}
      {tab === 'New job' && <NewJobPanel queueId={queueId} />}
    </div>
  );
}

function JobExplorer({ queueId }) {
  const [jobs, setJobs] = useState([]);
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState(null);

  async function load() {
    const params = { page, pageSize: 20 };
    if (status) params.status = status;
    const { data, pagination } = await api.listJobs(queueId, params);
    setJobs(data);
    setTotal(pagination.total);
  }

  useEffect(() => { load(); }, [queueId, status, page]);
  useEffect(() => { const t = setInterval(load, 3000); return () => clearInterval(t); }, [queueId, status, page]);

  return (
    <div style={{ display: 'flex', gap: 20 }}>
      <div style={{ flex: 1 }}>
        <div style={{ marginBottom: 12 }}>
          <select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}>
            <option value="">All statuses</option>
            {['queued','scheduled','claimed','running','completed','failed','dead_letter','cancelled'].map(s =>
              <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {jobs.length === 0 ? (
          <EmptyState title="No jobs" body="Jobs matching this filter will show up here as they're created." />
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--text-dim)', fontSize: 11, textTransform: 'uppercase' }}>
                <th style={th}>Job</th><th style={th}>Type</th><th style={th}>Status</th><th style={th}>Attempts</th><th style={th}>Created</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map(j => (
                <tr key={j.id} onClick={() => setSelected(j.id)} style={{ cursor: 'pointer', borderTop: '1px solid var(--border-hair)' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-panel-alt)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <td style={{ ...td, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>{j.id.slice(0, 8)}</td>
                  <td style={td}>{j.type}</td>
                  <td style={td}><StatusBadge status={j.status} /></td>
                  <td style={td}>{j.attempt_count}/{j.max_attempts ?? '—'}</td>
                  <td style={{ ...td, color: 'var(--text-dim)' }}>{new Date(j.created_at).toLocaleTimeString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 14, fontSize: 12, alignItems: 'center' }}>
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Prev</button>
          <span style={{ color: 'var(--text-dim)' }}>page {page} · {total} total</span>
          <button disabled={page * 20 >= total} onClick={() => setPage(p => p + 1)}>Next</button>
        </div>
      </div>

      {selected && <JobDetailPanel jobId={selected} onClose={() => setSelected(null)} onChange={load} />}
    </div>
  );
}

function JobDetailPanel({ jobId, onClose, onChange }) {
  const [job, setJob] = useState(null);
  const [logs, setLogs] = useState([]);

  async function load() {
    const { data } = await api.getJob(jobId);
    setJob(data);
    const l = await api.getJobLogs(jobId);
    setLogs(l.data);
  }
  useEffect(() => { load(); }, [jobId]);

  async function cancel() {
    await api.cancelJob(jobId);
    load(); onChange();
  }

  if (!job) return null;

  return (
    <div style={{
      width: 380, background: 'var(--bg-panel)', border: '1px solid var(--border-hair)',
      borderRadius: 'var(--radius-md)', padding: 18, height: 'fit-content',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="mono" style={{ fontSize: 13 }}>{job.id.slice(0, 8)}</div>
        <button onClick={onClose} style={{ border: 'none', background: 'none', padding: 0 }}>✕</button>
      </div>
      <div style={{ margin: '10px 0' }}><StatusBadge status={job.status} /></div>

      <Row label="Type" value={job.type} />
      <Row label="Attempts" value={`${job.attempt_count} / ${job.max_attempts ?? '—'}`} />
      <Row label="Created" value={new Date(job.created_at).toLocaleString()} />
      {job.last_error && <Row label="Last error" value={job.last_error} color="var(--accent-red)" />}

      <div style={{ marginTop: 14, fontSize: 12, color: 'var(--text-secondary)' }}>Payload</div>
      <pre style={{
        background: 'var(--bg-void)', border: '1px solid var(--border-hair)', borderRadius: 6,
        padding: 10, fontSize: 11, overflowX: 'auto', marginTop: 6,
      }}>{JSON.stringify(job.payload, null, 2)}</pre>

      {job.executions?.length > 0 && (
        <>
          <div style={{ marginTop: 14, fontSize: 12, color: 'var(--text-secondary)' }}>Execution history</div>
          {job.executions.map(ex => (
            <div key={ex.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '6px 0', borderTop: '1px solid var(--border-hair)' }}>
              <span>attempt {ex.attempt_number}</span>
              <StatusBadge status={ex.status} />
              <span style={{ color: 'var(--text-dim)' }}>{ex.duration_ms ?? '—'}ms</span>
            </div>
          ))}
        </>
      )}

      {logs.length > 0 && (
        <>
          <div style={{ marginTop: 14, fontSize: 12, color: 'var(--text-secondary)' }}>Logs</div>
          <div className="scrollbar-thin" style={{ maxHeight: 140, overflowY: 'auto', fontSize: 11, fontFamily: 'var(--font-mono)', marginTop: 6 }}>
            {logs.map(l => <div key={l.id} style={{ padding: '3px 0', color: l.level === 'error' ? 'var(--accent-red)' : 'var(--text-secondary)' }}>{l.message}</div>)}
          </div>
        </>
      )}

      {['queued', 'scheduled'].includes(job.status) && (
        <button onClick={cancel} style={{ marginTop: 14, width: '100%', fontSize: 12 }}>Cancel job</button>
      )}
    </div>
  );
}

function Row({ label, value, color }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '5px 0' }}>
      <span style={{ color: 'var(--text-dim)' }}>{label}</span>
      <span style={{ color: color || 'var(--text-primary)', textAlign: 'right', maxWidth: 220 }}>{value}</span>
    </div>
  );
}

function DlqPanel({ queueId }) {
  const [entries, setEntries] = useState([]);

  async function load() {
    const { data } = await api.listDlq(queueId);
    setEntries(data);
  }
  useEffect(() => { load(); }, [queueId]);

  async function retry(jobId) {
    await api.retryJob(jobId);
    load();
  }

  if (entries.length === 0) {
    return <EmptyState title="Dead letter queue is empty" body="Jobs that exhaust all retry attempts land here for manual review." />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {entries.map(e => (
        <div key={e.id} style={{
          background: 'var(--bg-panel)', border: '1px solid var(--accent-red)', borderRadius: 'var(--radius-md)',
          padding: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <div className="mono" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{e.job_id.slice(0, 8)} · {e.attempt_count} attempts</div>
            <div style={{ fontSize: 13, color: 'var(--accent-red)', marginTop: 4 }}>{e.final_error}</div>
          </div>
          <button className="primary" onClick={() => retry(e.job_id)}>Retry</button>
        </div>
      ))}
    </div>
  );
}

function NewJobPanel({ queueId }) {
  const [type, setType] = useState('immediate');
  const [handler, setHandler] = useState('noop');
  const [extra, setExtra] = useState({ delaySeconds: 10, runAt: '', cronExpression: '*/5 * * * *' });
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    const body = { queueId, type, payload: { handler } };
    if (type === 'delayed') body.delaySeconds = extra.delaySeconds;
    if (type === 'scheduled') body.runAt = extra.runAt;
    if (type === 'recurring') body.cronExpression = extra.cronExpression;
    if (type === 'batch') body.jobs = [{ payload: { handler } }, { payload: { handler } }, { payload: { handler } }];
    try {
      const res = await api.createJob(body);
      setResult(res);
    } catch (err) {
      setResult({ error: err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <label>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>Job type</div>
        <select value={type} onChange={e => setType(e.target.value)} style={{ width: '100%' }}>
          {['immediate', 'delayed', 'scheduled', 'recurring', 'batch'].map(t => <option key={t}>{t}</option>)}
        </select>
      </label>

      <label>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>Handler</div>
        <select value={handler} onChange={e => setHandler(e.target.value)} style={{ width: '100%' }}>
          <option value="noop">noop (always succeeds)</option>
          <option value="fail-always">fail-always (tests retry / DLQ)</option>
          <option value="sleep">sleep 1s</option>
        </select>
      </label>

      {type === 'delayed' && (
        <label>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>Delay (seconds)</div>
          <input type="number" value={extra.delaySeconds} onChange={e => setExtra({ ...extra, delaySeconds: Number(e.target.value) })} style={{ width: '100%' }} />
        </label>
      )}
      {type === 'scheduled' && (
        <label>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>Run at</div>
          <input type="datetime-local" value={extra.runAt} onChange={e => setExtra({ ...extra, runAt: e.target.value })} style={{ width: '100%' }} />
        </label>
      )}
      {type === 'recurring' && (
        <label>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>Cron expression</div>
          <input value={extra.cronExpression} onChange={e => setExtra({ ...extra, cronExpression: e.target.value })} style={{ width: '100%' }} />
        </label>
      )}
      {type === 'batch' && (
        <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Creates 3 jobs sharing one batch ID.</div>
      )}

      <button className="primary" type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create job'}</button>

      {result && (
        <pre style={{
          background: 'var(--bg-void)', border: '1px solid var(--border-hair)', borderRadius: 6,
          padding: 10, fontSize: 11, overflowX: 'auto',
        }}>{JSON.stringify(result, null, 2)}</pre>
      )}
    </form>
  );
}

const th = { padding: '8px 10px' };
const td = { padding: '8px 10px' };
