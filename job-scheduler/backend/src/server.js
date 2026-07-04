import http from 'http';
import { WebSocketServer } from 'ws';
import { app } from './app.js';
import { pool } from './db/pool.js';

const PORT = process.env.PORT || 4000;

const server = http.createServer(app);

// Lightweight WebSocket broadcast for live dashboard updates.
// Clients connect to /ws; server pushes queue/job summary every 3s.
// (Simple polling-push model — fine at this scale, easy to reason about.)
const wss = new WebSocketServer({ server, path: '/ws' });

function broadcast(data) {
  const msg = JSON.stringify(data);
  wss.clients.forEach((client) => {
    if (client.readyState === 1) client.send(msg);
  });
}

setInterval(async () => {
  if (wss.clients.size === 0) return;
  try {
    const { rows } = await pool.query(`
      SELECT status, count(*)::int AS count FROM jobs
      WHERE created_at > now() - interval '24 hours'
      GROUP BY status
    `);
    broadcast({ type: 'job_status_summary', data: rows, timestamp: new Date().toISOString() });
  } catch (err) {
    console.error('Broadcast query failed', err.message);
  }
}, 3000);

server.listen(PORT, () => {
  console.log(`Job scheduler API listening on :${PORT}`);
});
