/**
 * Compute delay before next retry attempt, given a policy and attempt number.
 * attemptNumber is 1-indexed (the attempt that just failed).
 */
export function computeRetryDelayMs(policy, attemptNumber) {
  const { strategy, base_delay_ms: base, max_delay_ms: max, jitter } = policy;
  let delay;

  switch (strategy) {
    case 'fixed':
      delay = base;
      break;
    case 'linear':
      delay = base * attemptNumber;
      break;
    case 'exponential':
    default:
      delay = base * Math.pow(2, attemptNumber - 1);
      break;
  }

  delay = Math.min(delay, max);

  if (jitter) {
    // Full jitter: random value in [0, delay] — avoids thundering herd of
    // retried jobs all waking up at the exact same instant.
    delay = Math.floor(Math.random() * delay);
  }

  return delay;
}

export function shouldRetry(job, policy) {
  const maxAttempts = policy?.max_attempts ?? job.max_attempts ?? 5;
  return job.attempt_count < maxAttempts;
}
