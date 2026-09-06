PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS system_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS providers (
  id TEXT PRIMARY KEY,
  role TEXT NOT NULL,
  status TEXT NOT NULL,
  auth_type TEXT,
  secret_ref TEXT,
  config_json TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS capabilities (
  id TEXT PRIMARY KEY,
  plane TEXT NOT NULL,
  permission_class TEXT NOT NULL DEFAULT 'READ',
  description TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS provider_capabilities (
  provider_id TEXT NOT NULL,
  capability_id TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 100,
  enabled INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (provider_id, capability_id),
  FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE,
  FOREIGN KEY (capability_id) REFERENCES capabilities(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  canonical_repo TEXT,
  canonical_source TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS resources (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  provider_id TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  external_id TEXT,
  canonical_url TEXT,
  content_hash TEXT,
  metadata_json TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
  FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS workflows (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  name TEXT NOT NULL,
  runtime TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  definition_ref TEXT,
  metadata_json TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  provider_id TEXT,
  external_id TEXT,
  title TEXT NOT NULL,
  status TEXT NOT NULL,
  metadata_json TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
  FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS knowledge_index (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  source_provider TEXT NOT NULL,
  source_id TEXT NOT NULL,
  title TEXT,
  canonical_ref TEXT,
  content_hash TEXT,
  metadata_json TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL,
  status TEXT NOT NULL,
  last_checked_at TEXT,
  expires_at TEXT,
  metadata_json TEXT,
  FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS deployments (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  provider_id TEXT NOT NULL,
  environment TEXT NOT NULL,
  commit_sha TEXT,
  status TEXT NOT NULL,
  deployment_ref TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
  FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS migration_sources (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL,
  source_ref TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  last_cursor TEXT,
  imported_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  correlation_id TEXT,
  actor TEXT,
  action TEXT NOT NULL,
  target TEXT,
  status TEXT NOT NULL,
  detail_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_resources_project ON resources(project_id);
CREATE INDEX IF NOT EXISTS idx_resources_provider ON resources(provider_id);
CREATE INDEX IF NOT EXISTS idx_tasks_project_status ON tasks(project_id, status);
CREATE INDEX IF NOT EXISTS idx_knowledge_source ON knowledge_index(source_provider, source_id);
CREATE INDEX IF NOT EXISTS idx_audit_correlation ON audit_log(correlation_id);
CREATE INDEX IF NOT EXISTS idx_deployments_project ON deployments(project_id, created_at);

INSERT OR REPLACE INTO system_meta(key, value) VALUES
  ('phase', 'VI'),
  ('toolkit_count', '1'),
  ('primary_runtime', 'cloudflare'),
  ('canonical_database', 'd1');

INSERT OR IGNORE INTO providers(id, role, status, auth_type, secret_ref) VALUES
  ('github','code_ci','active','github_app_or_token','/providers/github/prod'),
  ('google_drive','files_source','active','oauth_or_service_account','/providers/google-drive/prod'),
  ('linear','tasks_agents','active','oauth_or_api','/providers/linear/prod'),
  ('documents','artifacts','active','runtime_capability',NULL),
  ('template_creator','reusable_output','active','runtime_capability',NULL),
  ('infisical','identity_secrets','active','machine_identity',NULL),
  ('cloudflare','primary_runtime','active','api_token_or_ci_binding','/providers/cloudflare/prod'),
  ('notion','legacy_knowledge_migration','migration','oauth','/providers/notion/prod'),
  ('n8n','legacy_workflow_migration','migration','api_or_webhook','/providers/n8n/prod');
