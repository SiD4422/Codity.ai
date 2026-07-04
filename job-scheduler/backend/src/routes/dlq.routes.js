import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  const { queueId, page = 1, pageSize = 25 } = req.query;
  if (!queueId) return res.status(400).json({ error: 'queueId query param required' });

  const limit = Math.min(parseInt(pageSize, 10) || 25, 100);
  const offset = (Math.max(parseInt(page, 10) || 1, 1) - 1) * limit;

  const totalRes = await pool.query(
    'SELECT count(*)::int AS total FROM dead_letter_entries WHERE queue_id = $1 AND reprocessed = false',
    [queueId]
  );
  const { rows } = await pool.query(
    `SELECT * FROM dead_letter_entries WHERE queue_id = $1 AND reprocessed = false
     ORDER BY moved_at DESC LIMIT $2 OFFSET $3`,
    [queueId, limit, offset]
  );
  res.json({ data: rows, pagination: { page: Number(page), pageSize: limit, total: totalRes.rows[0].total } });
});

export default router;
