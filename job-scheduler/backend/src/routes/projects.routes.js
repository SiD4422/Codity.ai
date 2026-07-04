import { Router } from 'express';
import crypto from 'crypto';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  const { rows } = await pool.query(
    'SELECT * FROM projects WHERE organization_id = $1 ORDER BY created_at DESC',
    [req.user.organizationId]
  );
  res.json({ data: rows });
});

router.post('/', async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });

  const apiKey = crypto.randomBytes(24).toString('hex');
  try {
    const { rows } = await pool.query(
      `INSERT INTO projects (organization_id, name, api_key, created_by)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.user.organizationId, name, apiKey, req.user.id]
    );
    res.status(201).json({ data: rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Project name already exists' });
    console.error(err);
    res.status(500).json({ error: 'Failed to create project' });
  }
});

router.get('/:id', async (req, res) => {
  const { rows } = await pool.query(
    'SELECT * FROM projects WHERE id = $1 AND organization_id = $2',
    [req.params.id, req.user.organizationId]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Project not found' });
  res.json({ data: rows[0] });
});

export default router;
