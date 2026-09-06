-- OGENIC Phase VI — Agent Lane Registry
-- Shared execution-lane contract. No secret values are stored here.

CREATE TABLE IF NOT EXISTS agent_lanes (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  provider TEXT NOT NULL,
  role TEXT NOT NULL,
  execution_mode TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'REGISTERED',
  priority INTEGER NOT NULL DEFAULT 50,
  fallback_lane_id TEXT,
  current_task_id TEXT,
  last_heartbeat_at TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (fallback_lane_id) REFERENCES agent_lanes(id),
  FOREIGN KEY (current_task_id) REFERENCES agent_tasks(id)
);

CREATE INDEX IF NOT EXISTS idx_agent_lanes_status_priority
  ON agent_lanes(status, priority DESC);

INSERT INTO agent_lanes (
  id, display_name, provider, role, execution_mode, status, priority, fallback_lane_id, metadata_json
) VALUES
  ('ammonite', 'Ammonite', 'control', 'supervisor', 'SUPERVISOR', 'ACTIVE', 100, 'github-actions', '{"identity":"Harness—Ammonite-OC-Ops","verified":"chat+ops-api"}'),
  ('austra-v6', 'AUSTRA v6', 'austra', 'orchestrator', 'ORCHESTRATOR', 'REGISTERED', 90, 'ammonite', '{"binding":"external_runtime_pending"}'),
  ('codex', 'Codex', 'openai', 'builder', 'BUILDER', 'REGISTERED', 80, 'github-actions', '{"binding":"runtime_adapter_pending"}'),
  ('claude', 'Claude Agent', 'anthropic', 'reviewer', 'REVIEWER', 'REGISTERED', 70, 'codex', '{"binding":"runtime_adapter_pending"}'),
  ('github-actions', 'GitHub Actions', 'github', 'executor', 'EXECUTOR', 'ACTIVE', 85, 'ammonite', '{"verified":"ci+staging+ops-smoke"}'),
  ('linear', 'Linear', 'linear', 'task_bus', 'TASK_CONTROL', 'ACTIVE', 75, 'ammonite', '{"verified":"linear-d1-roundtrip"}')
ON CONFLICT(id) DO UPDATE SET
  display_name = excluded.display_name,
  provider = excluded.provider,
  role = excluded.role,
  execution_mode = excluded.execution_mode,
  priority = excluded.priority,
  fallback_lane_id = excluded.fallback_lane_id,
  metadata_json = excluded.metadata_json,
  updated_at = CURRENT_TIMESTAMP;

INSERT OR REPLACE INTO system_meta(key, value)
VALUES
  ('agent_lane_registry', 'd1'),
  ('agent_fallback_chain', 'primary>alternate_provider>automation>human_authorization>resume'),
  ('agent_lane_runtime_contract', 'registered_not_equal_bound');
