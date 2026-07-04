import { test } from 'node:test';
import assert from 'node:assert';
import { computeRetryDelayMs, shouldRetry } from '../utils/retry.js';

test('fixed strategy returns constant delay (jitter off)', () => {
  const policy = { strategy: 'fixed', base_delay_ms: 2000, max_delay_ms: 60000, jitter: false };
  assert.strictEqual(computeRetryDelayMs(policy, 1), 2000);
  assert.strictEqual(computeRetryDelayMs(policy, 5), 2000);
});

test('linear strategy scales with attempt number', () => {
  const policy = { strategy: 'linear', base_delay_ms: 1000, max_delay_ms: 60000, jitter: false };
  assert.strictEqual(computeRetryDelayMs(policy, 1), 1000);
  assert.strictEqual(computeRetryDelayMs(policy, 3), 3000);
});

test('exponential strategy doubles each attempt', () => {
  const policy = { strategy: 'exponential', base_delay_ms: 1000, max_delay_ms: 60000, jitter: false };
  assert.strictEqual(computeRetryDelayMs(policy, 1), 1000);
  assert.strictEqual(computeRetryDelayMs(policy, 2), 2000);
  assert.strictEqual(computeRetryDelayMs(policy, 4), 8000);
});

test('delay is capped at max_delay_ms', () => {
  const policy = { strategy: 'exponential', base_delay_ms: 1000, max_delay_ms: 5000, jitter: false };
  assert.strictEqual(computeRetryDelayMs(policy, 10), 5000);
});

test('jitter keeps delay within [0, computed]', () => {
  const policy = { strategy: 'fixed', base_delay_ms: 4000, max_delay_ms: 60000, jitter: true };
  for (let i = 0; i < 20; i++) {
    const d = computeRetryDelayMs(policy, 1);
    assert.ok(d >= 0 && d <= 4000, `delay ${d} out of range`);
  }
});

test('shouldRetry respects max_attempts', () => {
  const policy = { max_attempts: 3 };
  assert.strictEqual(shouldRetry({ attempt_count: 2 }, policy), true);
  assert.strictEqual(shouldRetry({ attempt_count: 3 }, policy), false);
  assert.strictEqual(shouldRetry({ attempt_count: 4 }, policy), false);
});
