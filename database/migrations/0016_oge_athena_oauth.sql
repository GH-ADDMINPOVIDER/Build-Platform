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
