-- Future runtime task lifecycle; implementation remains disabled until live E2E.
-- Legacy agent_tasks.id remains canonical. Never change seven-stones tables.
CREATE TABLE af_tasks (
 task_id TEXT PRIMARY KEY REFERENCES agent_tasks(id),
 thread_id TEXT NOT NULL REFERENCES af_threads(thread_id),
 logical_agent_id TEXT NOT NULL,
 assigned_principal TEXT REFERENCES af_principals(principal_id),
 status TEXT NOT NULL CHECK(status IN ('QUEUED','ASSIGNED','CLAIMED','ACKED','RUNNING','BLOCKED','COMPLETED','FAILED','CANCELLED','EXPIRED')),
 version INTEGER NOT NULL DEFAULT 1 CHECK(version>=1),
 fence INTEGER NOT NULL DEFAULT 0 CHECK(fence>=0),
 claim_id TEXT,
 lease_until INTEGER,
 context_ref TEXT REFERENCES af_contents(content_ref),
 correlation_id TEXT NOT NULL,
 result_ref TEXT REFERENCES af_contents(content_ref),
 pending_result_id TEXT,
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL
);
CREATE INDEX af_task_assignment_idx ON af_tasks(assigned_principal,status,updated_at);
CREATE INDEX af_task_lease_idx ON af_tasks(status,lease_until);
CREATE TABLE af_claims (
 claim_id TEXT PRIMARY KEY,
 task_id TEXT NOT NULL REFERENCES af_tasks(task_id),
 executor TEXT NOT NULL REFERENCES af_principals(principal_id),
 fence INTEGER NOT NULL,
 attempt INTEGER NOT NULL CHECK(attempt>=1),
 lease_until INTEGER NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('ACTIVE','SUBMITTED','CLOSED')),
 created_at INTEGER NOT NULL,
 closed_at INTEGER,
 UNIQUE(task_id,fence),
 UNIQUE(task_id,attempt)
);
CREATE TABLE af_receipts (
 receipt_id TEXT PRIMARY KEY,
 task_id TEXT NOT NULL REFERENCES af_tasks(task_id),
 claim_id TEXT NOT NULL REFERENCES af_claims(claim_id),
 submitted_by TEXT NOT NULL REFERENCES af_principals(principal_id),
 result_ref TEXT NOT NULL REFERENCES af_contents(content_ref),
 result_sha256 TEXT NOT NULL CHECK(length(result_sha256)=64),
 verification_state TEXT NOT NULL CHECK(verification_state IN ('SUBMITTED','VERIFIED','REJECTED','STALE')),
 source_sha TEXT,
 ci_run_id TEXT,
 ci_job_id TEXT,
 created_at INTEGER NOT NULL,
 verified_at INTEGER,
 CHECK((ci_run_id IS NULL AND ci_job_id IS NULL)
  OR (ci_run_id IS NOT NULL AND ci_job_id IS NOT NULL AND source_sha IS NOT NULL))
);
CREATE INDEX af_receipts_verification_idx ON af_receipts(verification_state,created_at);
