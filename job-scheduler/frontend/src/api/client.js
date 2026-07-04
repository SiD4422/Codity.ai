const BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000/api/v1';

function authHeaders() {
  const token = localStorage.getItem('jobscheduler_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export const api = {
  register: (body) => request('POST', '/auth/register', body),
  login: (body) => request('POST', '/auth/login', body),

  listProjects: () => request('GET', '/projects'),
  createProject: (body) => request('POST', '/projects', body),

  listQueues: (projectId) => request('GET', `/queues?projectId=${projectId}`),
  createQueue: (body) => request('POST', '/queues', body),
  pauseQueue: (id) => request('POST', `/queues/${id}/pause`),
  resumeQueue: (id) => request('POST', `/queues/${id}/resume`),
  queueStats: (id) => request('GET', `/queues/${id}/stats`),

  listJobs: (queueId, params = {}) => {
    const qs = new URLSearchParams({ queueId, ...params }).toString();
    return request('GET', `/jobs?${qs}`);
  },
  createJob: (body) => request('POST', '/jobs', body),
  getJob: (id) => request('GET', `/jobs/${id}`),
  getJobLogs: (id) => request('GET', `/jobs/${id}/logs`),
  cancelJob: (id) => request('POST', `/jobs/${id}/cancel`),
  retryJob: (id) => request('POST', `/jobs/${id}/retry`),

  listWorkers: (projectId) => request('GET', `/workers?projectId=${projectId}`),

  listDlq: (queueId) => request('GET', `/dlq?queueId=${queueId}`),

  listRetryPolicies: () => request('GET', '/retry-policies'),
  createRetryPolicy: (body) => request('POST', '/retry-policies', body),
};
