PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS chat_attachments (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  data_base64 TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
  created_at INTEGER NOT NULL,
  FOREIGN KEY (conversation_id) REFERENCES chat_conversations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_chat_attachments_conversation_created
  ON chat_attachments(conversation_id, created_at DESC);
