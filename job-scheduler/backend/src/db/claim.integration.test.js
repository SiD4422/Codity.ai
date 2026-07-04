/**
 * Integration test: fires N concurrent claim_next_job() calls against a queue
 * holding exactly M jobs and asserts every job is claimed by exactly one
 * caller — the core "no duplicate execution" guarantee. Requires a running
 * Postgres reachable via DATABASE_URL (see backend/.env).
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { pool } from '../db/pool.js';

async function setupFixture() {
  const org = await pool.query(`INSERT INTO organizations (name) VALUES ('test-org') RETURNING id`);
  const user = await pool.query(
    `INSERT INTO users (organization_id, email, password_hash, name, role)
     VALUES ($1, $2, 'x', 'Test', 'admin') RETURNING id`,
    [org.rows[0].id, `t-${Date.now()}@test.com`]
  );
  const project = await pool.query(
    `INSERT INTO projects (organization_id, name, api_key, created_by)
     VALUES ($1, 'test-proj', $2, $3) RETURNING id`,
    [org.rows[0].id, `key-${Date.now()}`, user.rows[0].id]
  );
  const queue = await pool.query(
    `INSERT INTO queues (project_id, name, concurrency_limit) VALUES ($1, 'test-q', 100) RETURNING id`,
    [project.rows[0].id]
  );
  return { queueId: queue.rows[0].id, projectId: project.rows[0].id };
}

test('claim_next_job never double-assigns under concurrent callers', async () => {
  const { queueId, projectId } = await setupFixture();
  const JOB_COUNT = 20;

  for (let i = 0; i < JOB_COUNT; i++) {
    await pool.query(`INSERT INTO jobs (queue_id, payload) VALUES ($1, $2)`, [queueId, { i }]);
  }

  // Simulate 20 workers, each firing 2 claim attempts concurrently -> 40 calls chasing 20 jobs.
  const workerIds = [];
  for (let i = 0; i < 20; i++) {
    const w = await pool.query(
      `INSERT INTO workers (project_id, hostname, status) VALUES ($1, $2, 'online') RETURNING id`,
      [projectId, `worker-${i}`]
    );
    workerIds.push(w.rows[0].id);
  }

  const claimCalls = [];
  for (let i = 0; i < 40; i++) {
    const workerId = workerIds[i % workerIds.length];
    claimCalls.push(pool.query('SELECT * FROM claim_next_job($1, $2)', [queueId, workerId]));
  }
  const results = await Promise.all(claimCalls);

  const claimedJobIds = results.map(r => r.rows[0]?.id).filter(Boolean);
  const uniqueIds = new Set(claimedJobIds);

  // Every claimed job must be unique — zero duplicates despite concurrent racing.
  assert.strictEqual(claimedJobIds.length, uniqueIds.size, 'a job was claimed more than once');
  // Exactly JOB_COUNT jobs existed, so at most JOB_COUNT can be claimed.
  assert.strictEqual(uniqueIds.size, JOB_COUNT);

  const dbCheck = await pool.query(
    `SELECT count(*)::int AS c FROM jobs WHERE queue_id = $1 AND status = 'claimed'`, [queueId]
  );
  assert.strictEqual(dbCheck.rows[0].c, JOB_COUNT, 'DB claimed-count mismatch');
});

test.after(async () => { await pool.end(); });
