PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS workflow_versions (
  workflow_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  git_sha TEXT NOT NULL,
  definition_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (workflow_id, version)
);

CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL,
  workflow_version INTEGER NOT NULL,
  trigger_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued','running','waiting','blocked','succeeded','failed','cancelled')),
  current_node_id TEXT,
  input_json TEXT NOT NULL,
  usage_json TEXT NOT NULL,
  next_attempt_at INTEGER,
  lease_owner TEXT,
  lease_until INTEGER,
  fence INTEGER NOT NULL DEFAULT 0,
  error_json TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (workflow_id, trigger_key),
  FOREIGN KEY (workflow_id, workflow_version)
    REFERENCES workflow_versions(workflow_id, version)
);

CREATE TABLE IF NOT EXISTS node_executions (
  run_id TEXT NOT NULL,
  node_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running','waiting','succeeded','failed','uncertain')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  idempotency_key TEXT NOT NULL UNIQUE,
  external_job_id TEXT,
  output_json TEXT,
  error_json TEXT,
  usage_json TEXT,
  started_at INTEGER,
  finished_at INTEGER,
  PRIMARY KEY (run_id, node_id),
  FOREIGN KEY (run_id) REFERENCES runs(id)
);

CREATE INDEX IF NOT EXISTS idx_runs_executor
  ON runs(status, next_attempt_at, lease_until);

CREATE INDEX IF NOT EXISTS idx_node_executions_run_status
  ON node_executions(run_id, status);
