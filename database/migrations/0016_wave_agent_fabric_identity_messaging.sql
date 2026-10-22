-- WAVE Native Agent Fabric, WF-002, staging first.
-- Non-destructive companion tables; no migration of historical agent_tasks/events.
-- Session/credential values are hashes, never plaintext tokens.
CREATE TABLE af_principals (
 principal_id TEXT PRIMARY KEY,
 kind TEXT NOT NULL CHECK(kind IN ('HUMAN','RUNTIME','SYSTEM')),
 status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','ACTIVE','REVOKED')),
 display_name TEXT NOT NULL,
 external_issuer TEXT,
 external_subject TEXT,
 auth_version INTEGER NOT NULL DEFAULT 1 CHECK(auth_version>=1),
 created_at INTEGER NOT NULL,
 UNIQUE(external_issuer,external_subject),
 CHECK((external_issuer IS NULL AND external_subject IS NULL)
    OR (external_issuer IS NOT NULL AND external_subject IS NOT NULL))
);
CREATE TABLE af_enrollments (
 enrollment_id TEXT PRIMARY KEY,
 principal_id TEXT NOT NULL REFERENCES af_principals(principal_id),
 permitted_email TEXT NOT NULL,
 token_sha256 TEXT NOT NULL UNIQUE CHECK(length(token_sha256)=64),
 expires_at INTEGER NOT NULL,
 consumed_at INTEGER,
 created_by TEXT NOT NULL,
 created_at INTEGER NOT NULL
);
CREATE TABLE af_sessions (
 token_sha256 TEXT PRIMARY KEY CHECK(length(token_sha256)=64),
 principal_id TEXT NOT NULL REFERENCES af_principals(principal_id),
 csrf_sha256 TEXT NOT NULL CHECK(length(csrf_sha256)=64),
 auth_version INTEGER NOT NULL,
 expires_at INTEGER NOT NULL,
 revoked_at INTEGER,
 created_at INTEGER NOT NULL
);
CREATE INDEX af_sessions_principal_idx ON af_sessions(principal_id, expires_at);
CREATE TABLE af_operations (
 operation_id TEXT PRIMARY KEY,
 principal_id TEXT NOT NULL REFERENCES af_principals(principal_id),
 name TEXT NOT NULL,
 idempotency_key TEXT NOT NULL,
 request_sha256 TEXT NOT NULL CHECK(length(request_sha256)=64),
 response_json TEXT NOT NULL CHECK(json_valid(response_json)),
 http_status INTEGER NOT NULL CHECK(http_status BETWEEN 200 AND 499),
 created_at INTEGER NOT NULL,
 UNIQUE(principal_id,name,idempotency_key)
);
CREATE TABLE af_threads (
 thread_id TEXT PRIMARY KEY,
 title TEXT NOT NULL,
 created_by TEXT NOT NULL REFERENCES af_principals(principal_id),
 version INTEGER NOT NULL DEFAULT 1,
 created_at INTEGER NOT NULL
);
CREATE TABLE af_thread_members (
 thread_id TEXT NOT NULL REFERENCES af_threads(thread_id),
 principal_id TEXT NOT NULL REFERENCES af_principals(principal_id),
 can_send INTEGER NOT NULL DEFAULT 1 CHECK(can_send IN (0,1)),
 joined_at INTEGER NOT NULL,
 revoked_at INTEGER,
 PRIMARY KEY(thread_id,principal_id)
);
CREATE INDEX af_member_inbox_idx ON af_thread_members(principal_id,revoked_at,thread_id);
CREATE TABLE af_contents (
 content_ref TEXT PRIMARY KEY,
 thread_id TEXT NOT NULL REFERENCES af_threads(thread_id),
 media_type TEXT NOT NULL DEFAULT 'text/plain',
 sha256 TEXT NOT NULL CHECK(length(sha256)=64),
 inline_utf8 TEXT NOT NULL,
 byte_length INTEGER NOT NULL CHECK(byte_length>=0 AND byte_length<=32768),
 created_by TEXT NOT NULL REFERENCES af_principals(principal_id),
 created_at INTEGER NOT NULL
);
CREATE TABLE af_messages (
 message_id TEXT PRIMARY KEY,
 thread_id TEXT NOT NULL REFERENCES af_threads(thread_id),
 task_id TEXT,
 correlation_id TEXT NOT NULL,
 sender_principal TEXT NOT NULL REFERENCES af_principals(principal_id),
 authorship TEXT NOT NULL CHECK(authorship IN ('HUMAN','AUTOMATED','SYSTEM')),
 body_ref TEXT NOT NULL REFERENCES af_contents(content_ref),
 reply_to TEXT REFERENCES af_messages(message_id),
 operation_id TEXT NOT NULL UNIQUE REFERENCES af_operations(operation_id),
 created_at INTEGER NOT NULL
);
CREATE INDEX af_messages_thread_idx ON af_messages(thread_id,created_at,message_id);
CREATE TABLE af_deliveries (
 seq INTEGER PRIMARY KEY AUTOINCREMENT,
 message_id TEXT NOT NULL REFERENCES af_messages(message_id),
 recipient_principal TEXT NOT NULL REFERENCES af_principals(principal_id),
 delivered_at INTEGER,
 read_at INTEGER,
 ack_id TEXT UNIQUE,
 acked_at INTEGER,
 created_at INTEGER NOT NULL,
 UNIQUE(message_id,recipient_principal),
 CHECK(read_at IS NULL OR delivered_at IS NOT NULL),
 CHECK(acked_at IS NULL OR (read_at IS NOT NULL AND ack_id IS NOT NULL))
);
CREATE INDEX af_inbox_idx ON af_deliveries(recipient_principal,seq);
CREATE INDEX af_inbox_unread_idx ON af_deliveries(recipient_principal,read_at,seq);
