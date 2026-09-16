PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS chat_session_refs (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  source_surface TEXT NOT NULL,
  session_ref TEXT NOT NULL,
  session_url TEXT,
  label TEXT,
  first_sequence INTEGER,
  last_sequence INTEGER,
  first_seen_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  FOREIGN KEY (conversation_id) REFERENCES chat_conversations(id) ON DELETE CASCADE,
  UNIQUE (conversation_id, source_surface, session_ref)
);

CREATE INDEX IF NOT EXISTS idx_chat_session_refs_line_recent
  ON chat_session_refs(conversation_id, last_seen_at DESC);

CREATE INDEX IF NOT EXISTS idx_chat_session_refs_surface_sequence
  ON chat_session_refs(conversation_id, source_surface, last_sequence DESC);
