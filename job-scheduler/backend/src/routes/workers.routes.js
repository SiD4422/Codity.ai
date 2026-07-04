import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  const { projectId } = req.query;
  if (!projectId) return res.status(400).json({ error: 'projectId query param required' });

  const { rows } = await pool.query(
    `SELECT w.*,
       (SELECT count(*)::int FROM jobs j WHERE j.claimed_by = w.id AND j.status = 'running') AS active_jobs
     FROM workers w WHERE w.project_id = $1 ORDER BY w.started_at DESC`,
    [projectId]
  );
  res.json({ data: rows });
});

router.get('/:id/heartbeats', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT * FROM worker_heartbeats WHERE worker_id = $1 ORDER BY created_at DESC LIMIT 50`,
    [req.params.id]
  );
  res.json({ data: rows });
});

export default router;
