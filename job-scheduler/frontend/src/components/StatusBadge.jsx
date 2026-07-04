const STATUS_STYLE = {
  queued:      { color: 'var(--text-secondary)', label: 'Queued' },
  scheduled:   { color: 'var(--accent-violet)',  label: 'Scheduled' },
  claimed:     { color: 'var(--accent-blue)',    label: 'Claimed' },
  running:     { color: 'var(--accent-blue)',    label: 'Running' },
  completed:   { color: 'var(--accent-teal)',    label: 'Completed' },
  failed:      { color: 'var(--accent-amber)',   label: 'Failed' },
  dead_letter: { color: 'var(--accent-red)',     label: 'Dead letter' },
  cancelled:   { color: 'var(--text-dim)',       label: 'Cancelled' },
  online:      { color: 'var(--accent-teal)',    label: 'Online' },
  offline:     { color: 'var(--accent-red)',     label: 'Offline' },
  draining:    { color: 'var(--accent-amber)',   label: 'Draining' },
  active:      { color: 'var(--accent-teal)',    label: 'Active' },
  paused:      { color: 'var(--accent-amber)',   label: 'Paused' },
};

export default function StatusBadge({ status }) {
  const s = STATUS_STYLE[status] || { color: 'var(--text-dim)', label: status };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      fontSize: 12, fontWeight: 600, color: s.color,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.color, display: 'inline-block' }} />
      {s.label}
    </span>
  );
}
