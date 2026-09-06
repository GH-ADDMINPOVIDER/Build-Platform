PRAGMA foreign_keys = ON;

-- Phase VI shared agent state for Harness—Ammonite-OC-Ops.
-- D1 stores operational state and references only; prompts and secret values stay outside D1.

CREATE TABLE IF NOT EXISTS agent_tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  capability TEXT,
  status TEXT NOT NULL DEFAULT 'QUEUED' CHECK (status IN (
    'QUEUED','CLAIMED','RUNNING','VERIFYING','DONE','BLOCKED',
    'REAUTH_REQUIRED','CONFIGURATION_REQUIRED','FAILED','CANCELLED'
  )),
  priority INTEGER NOT NULL DEFAULT 50 CHECK (priority BETWEEN 0 AND 100),
  resource_key TEXT,
  claimed_by TEXT,
  parent_task_id TEXT,
  correlation_id TEXT,
  linear_issue_id TEXT,
  github_repo TEXT,
  github_pr_number INTEGER,
  source_ref TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  claimed_at TEXT,
  completed_at TEXT,
  FOREIGN KEY (parent_task_id) REFERENCES agent_tasks(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS agent_events (
  id TEXT PRIMARY KEY,
  task_id TEXT,
  event_type TEXT NOT NULL,
  actor TEXT NOT NULL,
  correlation_id TEXT,
  external_ref TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (task_id) REFERENCES agent_tasks(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS agent_checkpoints (
  task_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  checkpoint_ref TEXT NOT NULL,
  state_hash TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (task_id, agent_id),
  FOREIGN KEY (task_id) REFERENCES agent_tasks(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS agent_locks (
  resource_key TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  owner_agent TEXT NOT NULL,
  acquired_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL,
  FOREIGN KEY (task_id) REFERENCES agent_tasks(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_agent_tasks_queue
  ON agent_tasks(status, priority DESC, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_claimed_by
  ON agent_tasks(claimed_by, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_resource
  ON agent_tasks(resource_key, status);
CREATE INDEX IF NOT EXISTS idx_agent_events_task
  ON agent_events(task_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_events_correlation
  ON agent_events(correlation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_checkpoints_agent
  ON agent_checkpoints(agent_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_locks_expiry
  ON agent_locks(expires_at);

INSERT OR REPLACE INTO system_meta(key, value) VALUES
  ('operator_harness', 'Harness—Ammonite-OC-Ops'),
  ('agent_shared_state_version', 'v1'),
  ('agent_shared_state_backend', 'cloudflare-d1'),
  ('agent_task_control_surface', 'linear'),
  ('agent_code_evidence_surface', 'github');

INSERT OR REPLACE INTO policy_rules(id, scope, rule_text, enforcement, enabled, source_id) VALUES
  ('agent-state-references-only','agents','Shared agent state stores operational status and references only; never persist raw secrets or long prompts in D1.','required',1,NULL),
  ('agent-resource-locking','agents','Agents must claim work and honor resource locks before mutating a shared resource.','required',1,NULL),
  ('agent-checkpoint-handoff','agents','Long-running agent work must persist a checkpoint reference so another agent can resume after quota/session loss.','required',1,NULL);
