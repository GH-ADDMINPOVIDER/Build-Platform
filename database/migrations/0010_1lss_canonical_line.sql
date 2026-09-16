PRAGMA foreign_keys = ON;

-- 1LSS keeps exactly one canonical ordered line per owner conversation.
-- Surfaces (web/app/ChatGPT harness/live assist) are metadata on that line,
-- never separate conversation histories.
ALTER TABLE chat_conversations ADD COLUMN last_sequence INTEGER NOT NULL DEFAULT 0;
ALTER TABLE chat_messages ADD COLUMN sequence_no INTEGER;
ALTER TABLE chat_messages ADD COLUMN source_surface TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE chat_messages ADD COLUMN idempotency_key TEXT;

-- Backfill the existing owner-main history into one stable order before
-- enforcing uniqueness for all new turns.
WITH ranked AS (
  SELECT
    rowid AS message_rowid,
    ROW_NUMBER() OVER (
      PARTITION BY conversation_id
      ORDER BY created_at ASC, rowid ASC
    ) AS seq
  FROM chat_messages
)
UPDATE chat_messages
SET sequence_no = (
  SELECT ranked.seq
  FROM ranked
  WHERE ranked.message_rowid = chat_messages.rowid
)
WHERE sequence_no IS NULL;

UPDATE chat_conversations
SET last_sequence = COALESCE((
  SELECT MAX(message.sequence_no)
  FROM chat_messages AS message
  WHERE message.conversation_id = chat_conversations.id
), 0);

CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_messages_conversation_sequence
  ON chat_messages(conversation_id, sequence_no)
  WHERE sequence_no IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_messages_conversation_idempotency
  ON chat_messages(conversation_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_chat_messages_surface_sequence
  ON chat_messages(conversation_id, source_surface, sequence_no DESC);
