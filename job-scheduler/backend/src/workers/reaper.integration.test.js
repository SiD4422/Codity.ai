/**
 * Integration test: simulates a worker that crashed ungracefully (heartbeat
 * goes silent while it still holds a claimed job) and verifies the reaper
 * recovers that job — retrying it if attempts remain, or dead-lettering it
 * if not — rather than leaving it stranded in 'running' forever.
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { pool } from '../db/pool.js';
import { tick } from './reaper.js';

async function setupFixture() {
  const org = await pool.query(`INSERT INTO organizations (name) VALUES ('reaper-test-org') RETURNING id`);
  const user = await pool.query(
    `INSERT INTO users (organization_id, email, password_hash, name, role)
     VALUES ($1, $2, 'x', 'Test', 'admin') RETURNING id`,
    [org.rows[0].id, `reaper-${Date.now()}@test.com`]
  );
  const project = await pool.query(
    `INSERT INTO projects (organization_id, name, api_key, created_by)
     VALUES ($1, 'reaper-proj', $2, $3) RETURNING id`,
    [org.rows[0].id, `reaper-key-${Date.now()}`, user.rows[0].id]
  );
  const queue = await pool.query(
    `INSERT INTO queues (project_id, name, concurrency_limit) VALUES ($1, 'reaper-q', 10) RETURNING id`,
    [project.rows[0].id]
  );
  return { queueId: queue.rows[0].id, projectId: project.rows[0].id };
}

async function makeSilentWorker(projectId) {
  // last_heartbeat_at set far enough in the past to be past STALE_HEARTBEAT_MS
  const { rows } = await pool.query(
    `INSERT INTO workers (project_id, hostname, status, last_heartbeat_at)
     VALUES ($1, 'crashed-host', 'online', now() - interval '5 minutes') RETURNING id`,
    [projectId]
  );
  return rows[0].id;
}

test('reaper requeues a job whose worker went silent, when retries remain', async () => {
  const { queueId, projectId } = await setupFixture();
  const workerId = await makeSilentWorker(projectId);

  const jobRes = await pool.query(
    `INSERT INTO jobs (queue_id, status, claimed_by, claimed_at, attempt_count, max_attempts)
     VALUES ($1, 'running', $2, now() - interval '3 minutes', 1, 5) RETURNING id`,
    [queueId, workerId]
  );
  const jobId = jobRes.rows[0].id;

  await tick();

  const { rows } = await pool.query('SELECT status, claimed_by, last_error FROM jobs WHERE id = $1', [jobId]);
  assert.strictEqual(rows[0].status, 'scheduled', 'job should be requeued, not left running');
  assert.strictEqual(rows[0].claimed_by, null, 'claim should be released');
  assert.ok(rows[0].last_error.includes('went silent'), 'should record why it was recovered');
});

test('reaper dead-letters a job whose worker went silent, when retries are exhausted', async () => {
  const { queueId, projectId } = await setupFixture();
  const workerId = await makeSilentWorker(projectId);

  const jobRes = await pool.query(
    `INSERT INTO jobs (queue_id, status, claimed_by, claimed_at, attempt_count, max_attempts)
     VALUES ($1, 'claimed', $2, now() - interval '3 minutes', 5, 5) RETURNING id`,
    [queueId, workerId]
  );
  const jobId = jobRes.rows[0].id;

  await tick();

  const jobCheck = await pool.query('SELECT status FROM jobs WHERE id = $1', [jobId]);
  assert.strictEqual(jobCheck.rows[0].status, 'dead_letter');

  const dlqCheck = await pool.query('SELECT * FROM dead_letter_entries WHERE job_id = $1', [jobId]);
  assert.strictEqual(dlqCheck.rows.length, 1);
});

test('reaper does not touch jobs whose worker is still alive', async () => {
  const { queueId, projectId } = await setupFixture();
  const { rows: healthyWorker } = await pool.query(
    `INSERT INTO workers (project_id, hostname, status, last_heartbeat_at)
     VALUES ($1, 'healthy-host', 'online', now()) RETURNING id`,
    [projectId]
  );

  const jobRes = await pool.query(
    `INSERT INTO jobs (queue_id, status, claimed_by, claimed_at, attempt_count, max_attempts)
     VALUES ($1, 'running', $2, now(), 1, 5) RETURNING id`,
    [queueId, healthyWorker[0].id]
  );
  const jobId = jobRes.rows[0].id;

  await tick();

  const { rows } = await pool.query('SELECT status FROM jobs WHERE id = $1', [jobId]);
  assert.strictEqual(rows[0].status, 'running', 'a job on a live worker must not be reaped');
});

test.after(async () => { await pool.end(); });
