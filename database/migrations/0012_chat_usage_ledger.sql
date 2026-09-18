PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS chat_usage_ledger (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  source_surface TEXT NOT NULL DEFAULT 'unknown',
  model TEXT NOT NULL,
  pool_id TEXT NOT NULL,
  usage_tokens INTEGER NOT NULL DEFAULT 0,
  billed_route TEXT NOT NULL DEFAULT 'incentive_guarded',
  created_at INTEGER NOT NULL,
  FOREIGN KEY (conversation_id) REFERENCES chat_conversations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_chat_usage_ledger_created
  ON chat_usage_ledger(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_chat_usage_ledger_pool_created
  ON chat_usage_ledger(pool_id, created_at DESC);
