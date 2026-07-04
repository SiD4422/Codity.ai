/**
 * Job handler registry. payload.handler picks which function runs.
 * In a real deployment this is where you'd plug in: send-email, resize-image,
 * generate-report, webhook-callback, etc. Kept generic here since the
 * assignment's focus is the scheduler, not any one business job type.
 */
const handlers = {
  async 'noop'(payload, log) {
    log(`noop job executed with payload: ${JSON.stringify(payload)}`);
  },

  async 'http-webhook'(payload, log) {
    if (!payload.url) throw new Error('http-webhook job requires payload.url');
    log(`calling webhook ${payload.url}`);
    const res = await fetch(payload.url, {
      method: payload.method || 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload.body || {}),
    });
    if (!res.ok) throw new Error(`webhook returned status ${res.status}`);
    log(`webhook succeeded with status ${res.status}`);
  },

  async 'fail-always'(payload, log) {
    // Useful for testing retry/DLQ behavior end-to-end.
    log('simulating failure');
    throw new Error(payload.message || 'Simulated failure for testing');
  },

  async 'sleep'(payload, log) {
    const ms = payload.ms || 1000;
    log(`sleeping ${ms}ms`);
    await new Promise((r) => setTimeout(r, ms));
  },
};

export async function runJobHandler(job, log) {
  const handlerName = job.payload?.handler || 'noop';
  const fn = handlers[handlerName];
  if (!fn) throw new Error(`Unknown job handler: ${handlerName}`);
  await fn(job.payload, log);
}
