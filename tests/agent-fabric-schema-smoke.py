#!/usr/bin/env python3
"""Local SQLite migrations and isolation test. No staging/prod mutations."""
import sqlite3
from pathlib import Path
root=Path(__file__).resolve().parents[1]
db=sqlite3.connect(':memory:')
db.execute('PRAGMA foreign_keys=ON')
db.executescript("""
CREATE TABLE agent_tasks(id TEXT PRIMARY KEY,title TEXT,capability TEXT,status TEXT,
priority INTEGER,resource_key TEXT,correlation_id TEXT,source_ref TEXT,
attempt_count INTEGER,created_at TEXT,updated_at TEXT);
CREATE TABLE agent_events(id TEXT PRIMARY KEY,task_id TEXT,event_type TEXT,actor TEXT,
correlation_id TEXT,external_ref TEXT,created_at TEXT);
CREATE TABLE agent_checkpoints(task_id TEXT,agent_id TEXT,checkpoint_ref TEXT,state_hash TEXT);
""")
for name in ("0016_wave_agent_fabric_identity_messaging.sql","0017_wave_agent_fabric_task_state.sql"):
    sql=(root/"database"/"migrations"/name).read_text()
    db.executescript(sql)
    print("MIGRATION_SYNTAX_PASS",name)
db.execute("INSERT INTO af_principals(principal_id,kind,status,display_name,created_at) VALUES ('human:gs','HUMAN','ACTIVE','GS',1)")
db.execute("INSERT INTO af_principals(principal_id,kind,status,display_name,created_at) VALUES ('human:gt','HUMAN','ACTIVE','GT',1)")
db.execute("INSERT INTO af_threads(thread_id,title,created_by,created_at) VALUES ('t','test','human:gs',1)")
db.execute("INSERT INTO af_thread_members(thread_id,principal_id,joined_at) VALUES ('t','human:gs',1)")
db.execute("INSERT INTO af_thread_members(thread_id,principal_id,joined_at) VALUES ('t','human:gt',1)")
db.execute("""INSERT INTO af_operations(operation_id,principal_id,name,idempotency_key,request_sha256,
response_json,http_status,created_at) VALUES ('op','human:gs','message:send','key-00000001',?,'{}',201,1)""",('a'*64,))
db.execute("""INSERT INTO af_contents(content_ref,thread_id,sha256,inline_utf8,byte_length,created_by,created_at)
VALUES ('content','t',?,'PING GT',7,'human:gs',1)""",('b'*64,))
db.execute("""INSERT INTO af_messages(message_id,thread_id,correlation_id,sender_principal,authorship,
body_ref,operation_id,created_at) VALUES('m','t','corr','human:gs','HUMAN','content','op',1)""")
db.execute("INSERT INTO af_deliveries(message_id,recipient_principal,created_at) VALUES('m','human:gt',1)")
assert db.execute("SELECT recipient_principal FROM af_deliveries WHERE message_id='m'").fetchone()[0]=='human:gt'
try:
    db.execute("INSERT INTO af_deliveries(message_id,recipient_principal,created_at) VALUES('m','human:gt',1)")
    raise AssertionError("duplicate message delivery accepted")
except sqlite3.IntegrityError: pass
db.execute("INSERT INTO agent_tasks(id,title,capability,status) VALUES('task1','test','agent_fabric','QUEUED')")
db.execute("""INSERT INTO af_tasks(task_id,thread_id,logical_agent_id,assigned_principal,status,
correlation_id,created_at,updated_at) VALUES('task1','t','GT','human:gt','ASSIGNED','corr',1,1)""")
assert db.execute("SELECT count(*) FROM af_tasks WHERE task_id='task1'").fetchone()[0]==1
print("SCHEMA_FOREIGN_KEY_UNIQUE_AND_TASK_SIDECAR_PASS")
