import jwt from 'jsonwebtoken';
import { pool } from '../db/pool.js';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';
const JWT_EXPIRY = '24h';

export function signToken(user) {
  return jwt.sign(
    { sub: user.id, org: user.organization_id, role: user.role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRY }
  );
}

// User-facing auth: verifies JWT from dashboard login
export function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or malformed Authorization header' });
  }
  try {
    const payload = jwt.verify(header.slice(7), JWT_SECRET);
    req.user = { id: payload.sub, organizationId: payload.org, role: payload.role };
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin role required' });
  }
  next();
}

// Service auth: workers / API clients authenticate with a project API key
// instead of a user JWT. Scopes the request to that project.
export async function requireApiKey(req, res, next) {
  const key = req.headers['x-api-key'];
  if (!key) return res.status(401).json({ error: 'Missing X-API-Key header' });

  const { rows } = await pool.query(
    'SELECT id, organization_id FROM projects WHERE api_key = $1',
    [key]
  );
  if (rows.length === 0) return res.status(401).json({ error: 'Invalid API key' });

  req.project = rows[0];
  next();
}
