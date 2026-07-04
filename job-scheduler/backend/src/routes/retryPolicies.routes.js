import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM retry_policies ORDER BY created_at DESC');
  res.json({ data: rows });
});

router.post('/', async (req, res) => {
  const { name, strategy = 'exponential', maxAttempts = 5, baseDelayMs = 1000, maxDelayMs = 300000, jitter = true } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });

  const { rows } = await pool.query(
    `INSERT INTO retry_policies (name, strategy, max_attempts, base_delay_ms, max_delay_ms, jitter)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [name, strategy, maxAttempts, baseDelayMs, maxDelayMs, jitter]
  );
  res.status(201).json({ data: rows[0] });
});

export default router;
