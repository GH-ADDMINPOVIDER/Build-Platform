CREATE TABLE IF NOT EXISTS connector_events (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  event_type TEXT NOT NULL,
  state TEXT NOT NULL,
  external_id TEXT,
  detail_json TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_connector_events_created_at
  ON connector_events(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_connector_events_provider_created_at
  ON connector_events(provider, created_at DESC);

CREATE TABLE IF NOT EXISTS connector_hook_dedup (
  event_key TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_connector_hook_dedup_created_at
  ON connector_hook_dedup(created_at DESC);
