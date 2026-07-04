-- ============================================================
-- Atomic job claiming.
-- Uses SELECT ... FOR UPDATE SKIP LOCKED so N workers can poll the
-- same queue concurrently with zero double-claims and no blocking
-- (SKIP LOCKED lets a worker skip rows another tx already locked,
-- instead of waiting on them).
-- ============================================================

CREATE OR REPLACE FUNCTION claim_next_job(
  p_queue_id UUID,
  p_worker_id UUID
) RETURNS jobs AS $$
DECLARE
  v_job jobs;
BEGIN
  SELECT j.* INTO v_job
  FROM jobs j
  JOIN queues q ON q.id = j.queue_id
  WHERE j.queue_id = p_queue_id
    AND j.status IN ('queued', 'scheduled')
    AND j.run_at <= now()
    AND q.state = 'active'
    -- respect queue concurrency: count currently-running jobs in this queue
    AND (
      SELECT count(*) FROM jobs r
      WHERE r.queue_id = p_queue_id AND r.status IN ('claimed', 'running')
    ) < q.concurrency_limit
  ORDER BY j.priority DESC, j.run_at ASC
  FOR UPDATE OF j SKIP LOCKED
  LIMIT 1;

  IF v_job.id IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE jobs
  SET status = 'claimed',
      claimed_by = p_worker_id,
      claimed_at = now(),
      attempt_count = attempt_count + 1
  WHERE id = v_job.id
  RETURNING * INTO v_job;

  RETURN v_job;
END;
$$ LANGUAGE plpgsql;
