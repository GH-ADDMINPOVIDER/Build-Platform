-- CP-055 / CP-056 WAVE Task Envelope staging schema.
-- Additive only: no existing WAVE, D1, ATHENA, Yellow Stone, Fabric, or local-agent tables are modified.

CREATE TABLE IF NOT EXISTS task_envelopes (
  task_id TEXT PRIMARY KEY CHECK (task_id LIKE 'waveenv_%'),
  version TEXT NOT NULL CHECK (version = 'wave.task.envelope.v1'),
  idempotency_key TEXT NOT NULL,
  title TEXT NOT NULL,
  instruction_sha256 TEXT NOT NULL CHECK (length(instruction_sha256) = 64),
  context_ref TEXT NOT NULL,
  context_revision INTEGER NOT NULL DEFAULT 1 CHECK (context_revision >= 1),
  context_sha256 TEXT CHECK (context_sha256 IS NULL OR length(context_sha256) = 64),
  a2a_context_id TEXT,
  a2a_task_id TEXT,
  scope_json TEXT NOT NULL,
  target_zone TEXT NOT NULL CHECK (target_zone IN ('WAVE','TMN','EXTERNAL_SPECIALIST')),
  permission TEXT NOT NULL CHECK (permission IN ('READ','WRITE','EXECUTE')),
  authority_ref TEXT NOT NULL,
  signed_gate TEXT NOT NULL DEFAULT 'ATHENA_YELLOW' CHECK (signed_gate = 'ATHENA_YELLOW'),
  execution_state TEXT NOT NULL DEFAULT 'TASK_IN' CHECK (execution_state IN ('TASK_IN','AUTHORIZED','ROUTED','EXECUTING','RESULT_OUT','RESULT_VERIFIED','BLOCKED','FAILED')),
  executor_ref TEXT,
  command_task_id TEXT,
  external_task_id TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  max_attempts INTEGER NOT NULL DEFAULT 1 CHECK (max_attempts >= 1),
  fallback_mode TEXT NOT NULL DEFAULT 'HOLD_FOR_OWNER' CHECK (fallback_mode IN ('HOLD_FOR_OWNER','TMN_RETRY','LINEAR_SPECIALIST','MANUS_SPECIALIST','NO_FALLBACK')),
  fallback_reason TEXT NOT NULL DEFAULT '',
  result_receipt_id TEXT,
  result_hash TEXT CHECK (result_hash IS NULL OR length(result_hash) = 64),
  evidence_ref TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_task_envelopes_idempotency
  ON task_envelopes(idempotency_key);

CREATE INDEX IF NOT EXISTS idx_task_envelopes_state_target
  ON task_envelopes(execution_state, target_zone, updated_at);

CREATE INDEX IF NOT EXISTS idx_task_envelopes_context
  ON task_envelopes(context_ref, context_revision);

CREATE TABLE IF NOT EXISTS task_envelope_events (
  event_id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES task_envelopes(task_id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'TASK_IN_ACCEPTED',
    'ATHENA_YELLOW_AUTHORIZED',
    'ATHENA_YELLOW_REJECTED',
    'ROUTED_TO_TMN',
    'ROUTED_TO_EXTERNAL_SPECIALIST',
    'EXECUTION_STARTED',
    'RESULT_OUT_RECEIVED',
    'RESULT_VERIFIED',
    'FALLBACK_REQUESTED',
    'TASK_BLOCKED',
    'TASK_FAILED'
  )),
  actor TEXT NOT NULL,
  correlation_id TEXT NOT NULL,
  external_ref TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_task_envelope_events_task_created
  ON task_envelope_events(task_id, created_at);

CREATE INDEX IF NOT EXISTS idx_task_envelope_events_correlation
  ON task_envelope_events(correlation_id, created_at);

CREATE TABLE IF NOT EXISTS task_envelope_receipts (
  receipt_id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES task_envelopes(task_id) ON DELETE CASCADE,
  receipt_state TEXT NOT NULL CHECK (receipt_state IN ('RESULT_OUT','RESULT_VERIFIED','FAILED','BLOCKED')),
  result_hash TEXT NOT NULL CHECK (length(result_hash) = 64),
  evidence_ref TEXT NOT NULL,
  executor_ref TEXT NOT NULL,
  lincenc_checkpoint_ref TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_task_envelope_receipts_task
  ON task_envelope_receipts(task_id, receipt_id);
