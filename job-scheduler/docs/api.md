# API Documentation

Base URL: `http://localhost:4000/api/v1`

Machine-readable spec: [`openapi.yaml`](./openapi.yaml) (validated with
`swagger-cli validate`). This document is the narrative version of the same
API.

All endpoints except `/auth/register` and `/auth/login` require
`Authorization: Bearer <jwt>`. Rate limit: 300 requests/min per client
(global, `express-rate-limit`).

Standard response shapes:
- Success: `{ "data": ... }` (list endpoints add `"pagination": { page, pageSize, total }`)
- Error: `{ "error": "message" }`

---

## Auth

### `POST /auth/register`
Body: `{ email, password (min 8 chars), name, organizationName }`
Creates an organization + admin user in one transaction. Returns `{ user, token }`.

### `POST /auth/login`
Body: `{ email, password }` → `{ user, token }`

---

## Projects

### `GET /projects`
List projects in caller's organization.

### `POST /projects`
Body: `{ name }`. Generates a project `api_key` used by workers.

### `GET /projects/:id`

---

## Queues

### `GET /queues?projectId=<id>`

### `POST /queues`
Body: `{ projectId, name, priority?, concurrencyLimit?, retryPolicyId? }`

### `PATCH /queues/:id`
Body: any of `{ priority, concurrencyLimit, retryPolicyId }`

### `POST /queues/:id/pause` / `POST /queues/:id/resume`

### `GET /queues/:id/stats`
Returns `{ statusCounts, completedLastHour, avgDurationMs }`.

---

## Jobs

### `POST /jobs`
Body varies by `type`:

| type | required fields | notes |
|---|---|---|
| `immediate` | `queueId` | runs as soon as claimed |
| `delayed` | `queueId`, `delaySeconds` | `run_at = now() + delaySeconds` |
| `scheduled` | `queueId`, `runAt` (ISO timestamp) | runs at a specific instant |
| `recurring` | `queueId`, `cronExpression` | creates a `scheduled_jobs` definition, not a job row directly |
| `batch` | `queueId`, `jobs: [{payload}, ...]` | all share one `batch_id` |

Common optional fields: `payload` (object, `payload.handler` selects which
worker handler runs — see `backend/src/workers/handlers.js`), `priority`,
`retryPolicyId`, `idempotencyKey` (dedupes within a queue).

### `GET /jobs?queueId=<id>&status=&type=&page=&pageSize=`
Paginated, filterable list.

### `GET /jobs/:id`
Returns the job plus its full `executions` array.

### `GET /jobs/:id/logs`

### `POST /jobs/:id/cancel`
Only valid while `status` is `queued` or `scheduled`.

### `POST /jobs/:id/retry`
Requeues a job currently sitting in the Dead Letter Queue.

---

## Workers

### `GET /workers?projectId=<id>`
Includes live `active_jobs` count per worker.

### `GET /workers/:id/heartbeats`
Last 50 heartbeats.

---

## Dead Letter Queue

### `GET /dlq?queueId=<id>&page=&pageSize=`

---

## Retry Policies

### `GET /retry-policies`

### `POST /retry-policies`
Body: `{ name, strategy: 'fixed'|'linear'|'exponential', maxAttempts?, baseDelayMs?, maxDelayMs?, jitter? }`

---

## WebSocket

`ws://localhost:4000/ws` — pushes `{ type: 'job_status_summary', data: [{status, count}], timestamp }`
every 3 seconds while at least one client is connected.

---

## Example: end-to-end curl

```bash
BASE=http://localhost:4000/api/v1
TOKEN=$(curl -s -X POST $BASE/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"password123"}' | jq -r .token)

curl -s -X POST $BASE/jobs -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"queueId":"<queue-id>","type":"delayed","delaySeconds":30,"payload":{"handler":"noop"}}'
```
