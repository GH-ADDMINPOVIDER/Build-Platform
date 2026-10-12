PRAGMA foreign_keys = ON;

-- OGE Athena OAuth authorization-server state for existing WAVE/1LSS runtime.
-- Additive, staging-first migration candidate. Never apply automatically from plugin packaging.
-- Only hashes of authorization codes and bearer/refresh tokens are stored; plaintext tokens
-- are returned only to the OAuth client and are never persisted in D1.

CREATE TABLE IF NOT EXISTS mcp_oauth_clients (
  client_id TEXT PRIMARY KEY,
  client_name TEXT NOT NULL,
  redirect_uris_json TEXT NOT NULL,
  grant_types_json TEXT NOT NULL,
  response_types_json TEXT NOT NULL,
  token_endpoint_auth_method TEXT NOT NULL CHECK (token_endpoint_auth_method = 'none'),
  client_uri TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_mcp_oauth_clients_created_at
  ON mcp_oauth_clients(created_at DESC);

CREATE TABLE IF NOT EXISTS mcp_oauth_authorization_codes (
  code_hash TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  agent_id TEXT NOT NULL CHECK (agent_id IN ('gs', 'gt', 'claude', 'deepseek')),
  redirect_uri TEXT NOT NULL,
  resource TEXT NOT NULL,
  code_challenge TEXT NOT NULL,
  scope TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_mcp_oauth_codes_expiry
  ON mcp_oauth_authorization_codes(expires_at, consumed_at);

CREATE TABLE IF NOT EXISTS mcp_oauth_tokens (
  token_hash TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  agent_id TEXT NOT NULL CHECK (agent_id IN ('gs', 'gt', 'claude', 'deepseek')),
  owner_id TEXT NOT NULL,
  resource TEXT NOT NULL,
  scope TEXT NOT NULL,
  token_type TEXT NOT NULL CHECK (token_type IN ('access', 'refresh')),
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_mcp_oauth_tokens_expiry
  ON mcp_oauth_tokens(token_type, expires_at, revoked_at);

CREATE INDEX IF NOT EXISTS idx_mcp_oauth_tokens_client
  ON mcp_oauth_tokens(client_id, token_type, created_at DESC);


-- Bounded two-agent relay ledger in the existing canonical D1 database.
-- Message content is short, secret-pattern screened, and never grants execution authority.
CREATE TABLE IF NOT EXISTS agent_threads (
  thread_id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL DEFAULT 'owner-main',
  correlation_id TEXT NOT NULL UNIQUE,
  participant_a TEXT NOT NULL CHECK (participant_a IN ('gs', 'gt', 'claude', 'deepseek')),
  participant_b TEXT NOT NULL CHECK (participant_b IN ('gs', 'gt', 'claude', 'deepseek')),
  created_by TEXT NOT NULL CHECK (created_by IN ('gs', 'gt', 'claude', 'deepseek')),
  created_at INTEGER NOT NULL,
  last_message_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  CHECK (participant_a <> participant_b)
);

CREATE INDEX IF NOT EXISTS idx_agent_threads_participant_a
  ON agent_threads(participant_a, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_threads_participant_b
  ON agent_threads(participant_b, last_message_at DESC);

CREATE TABLE IF NOT EXISTS agent_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL DEFAULT 'owner-main',
  thread_id TEXT NOT NULL,
  sender_agent_id TEXT NOT NULL CHECK (sender_agent_id IN ('gs', 'gt', 'claude', 'deepseek')),
  recipient_agent_id TEXT NOT NULL CHECK (recipient_agent_id IN ('gs', 'gt', 'claude', 'deepseek')),
  content TEXT NOT NULL,
  content_sha256 TEXT NOT NULL,
  correlation_id TEXT NOT NULL,
  idempotency_key_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('PENDING', 'DELIVERED', 'ACKNOWLEDGED')),
  created_at INTEGER NOT NULL,
  delivered_at INTEGER,
  acknowledged_at INTEGER,
  expires_at INTEGER NOT NULL,
  CHECK (sender_agent_id <> recipient_agent_id),
  FOREIGN KEY (thread_id) REFERENCES agent_threads(thread_id) ON DELETE CASCADE,
  UNIQUE (sender_agent_id, idempotency_key_hash)
);

CREATE INDEX IF NOT EXISTS idx_agent_messages_inbox
  ON agent_messages(recipient_agent_id, status, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_agent_messages_thread
  ON agent_messages(thread_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_agent_messages_correlation
  ON agent_messages(correlation_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_agent_messages_expiry
  ON agent_messages(expires_at);

-- Controlled simulation runs are kept separate from live agent_messages and live agent_events.
CREATE TABLE IF NOT EXISTS agent_simulation_runs (
  simulation_id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL DEFAULT 'owner-main',
  scenario_type TEXT NOT NULL CHECK (scenario_type IN (
    'STALE_CONTEXT', 'DUPLICATE_DELIVERY', 'OUT_OF_ORDER',
    'SESSION_DRIFT', 'DELEGATION_LOOP', 'IDENTITY_SPOOF'
  )),
  seed TEXT NOT NULL,
  base_revision TEXT NOT NULL,
  created_by TEXT NOT NULL CHECK (created_by IN ('gs', 'gt', 'claude', 'deepseek')),
  participant_a TEXT NOT NULL CHECK (participant_a IN ('gs', 'gt', 'claude', 'deepseek')),
  participant_b TEXT NOT NULL CHECK (participant_b IN ('gs', 'gt', 'claude', 'deepseek')),
  status TEXT NOT NULL CHECK (status IN ('PLANNED', 'RUNNING', 'COMPLETED', 'ABORTED')),
  plan_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  finished_at INTEGER,
  CHECK (participant_a <> participant_b)
);

CREATE TABLE IF NOT EXISTS agent_simulation_events (
  event_id TEXT PRIMARY KEY,
  simulation_id TEXT NOT NULL,
  sequence_no INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  actor_agent_id TEXT,
  fault_label TEXT,
  metadata_json TEXT NOT NULL,
  idempotency_key_hash TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  UNIQUE (simulation_id, sequence_no),
  UNIQUE (simulation_id, actor_agent_id, idempotency_key_hash),
  FOREIGN KEY (simulation_id) REFERENCES agent_simulation_runs(simulation_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_agent_simulation_runs_created
  ON agent_simulation_runs(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_simulation_events_replay
  ON agent_simulation_events(simulation_id, sequence_no ASC);
