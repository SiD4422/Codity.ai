import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';

import authRoutes from './routes/auth.routes.js';
import projectRoutes from './routes/projects.routes.js';
import queueRoutes from './routes/queues.routes.js';
import jobRoutes from './routes/jobs.routes.js';
import workerRoutes from './routes/workers.routes.js';
import dlqRoutes from './routes/dlq.routes.js';
import retryPolicyRoutes from './routes/retryPolicies.routes.js';

export const app = express();

app.use(cors());
app.use(express.json({ limit: '2mb' }));

// Global rate limit — protects the API from abusive polling/spam.
const limiter = rateLimit({ windowMs: 60_000, max: 300 });
app.use('/api', limiter);

app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/queues', queueRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/workers', workerRoutes);
app.use('/api/dlq', dlqRoutes);
app.use('/api/retry-policies', retryPolicyRoutes);

// Structured error handler — keeps error shape consistent across the API.
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

app.use((req, res) => res.status(404).json({ error: 'Not found' }));
