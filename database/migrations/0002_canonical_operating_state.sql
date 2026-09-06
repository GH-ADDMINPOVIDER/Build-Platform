PRAGMA foreign_keys = ON;

-- Phase VI canonical operating-state layer.
-- Raw credentials never belong in D1; store only provider/secret references.

CREATE TABLE IF NOT EXISTS toolkits (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phase TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  entrypoint TEXT NOT NULL,
  control_plane TEXT NOT NULL,
  runtime_provider TEXT NOT NULL,
  database_provider TEXT NOT NULL,
  secret_provider TEXT NOT NULL,
  version TEXT NOT NULL,
  metadata_json TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (runtime_provider) REFERENCES providers(id),
  FOREIGN KEY (secret_provider) REFERENCES providers(id)
);

CREATE TABLE IF NOT EXISTS canonical_sources (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL,
  external_id TEXT,
  title TEXT NOT NULL,
  canonical_url TEXT,
  source_kind TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  precedence INTEGER NOT NULL DEFAULT 100,
  source_last_edited_at TEXT,
  content_hash TEXT,
  migration_status TEXT NOT NULL DEFAULT 'pending',
  metadata_json TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS system_planes (
  id TEXT PRIMARY KEY,
  ordinal INTEGER NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  source_id TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (source_id) REFERENCES canonical_sources(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS command_aliases (
  alias TEXT PRIMARY KEY,
  capability_id TEXT NOT NULL,
  description TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  source_id TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (source_id) REFERENCES canonical_sources(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS policy_rules (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL,
  rule_text TEXT NOT NULL,
  enforcement TEXT NOT NULL DEFAULT 'required',
  enabled INTEGER NOT NULL DEFAULT 1,
  source_id TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (source_id) REFERENCES canonical_sources(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS knowledge_documents (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  source_id TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  format TEXT NOT NULL DEFAULT 'markdown',
  canonical INTEGER NOT NULL DEFAULT 0,
  content_hash TEXT,
  source_last_edited_at TEXT,
  migrated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  metadata_json TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
  FOREIGN KEY (source_id) REFERENCES canonical_sources(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS provider_bindings (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL,
  environment TEXT NOT NULL DEFAULT 'prod',
  binding_type TEXT NOT NULL,
  secret_ref TEXT,
  status TEXT NOT NULL DEFAULT 'unverified',
  last_checked_at TEXT,
  metadata_json TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(provider_id, environment, binding_type),
  FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_canonical_sources_precedence
  ON canonical_sources(status, precedence);
CREATE INDEX IF NOT EXISTS idx_knowledge_documents_source
  ON knowledge_documents(source_id, canonical);
CREATE INDEX IF NOT EXISTS idx_provider_bindings_status
  ON provider_bindings(provider_id, environment, status);

-- Keep optional migration/runtime providers represented in D1 as well as config/providers.json.
INSERT OR IGNORE INTO providers(id, role, status, auth_type, secret_ref) VALUES
  ('vercel','optional_legacy_deploy','optional','oauth_or_token','/providers/vercel/prod'),
  ('clickup','optional_legacy_tasks','optional','oauth_or_token','/providers/clickup/prod');

-- One user-facing toolkit / one control plane.
INSERT OR REPLACE INTO toolkits(
  id, name, phase, status, entrypoint, control_plane,
  runtime_provider, database_provider, secret_provider, version, metadata_json
) VALUES (
  'ogenic-core',
  'OGENIC CORE',
  'VI',
  'active',
  '@OGENIC CORE',
  'capability_registry',
  'cloudflare',
  'd1',
  'infisical',
  '6.0',
  '{"principle":"One toolkit, one control plane, many provider bindings","legacy_wrappers":["OGENIC GOD TOOLKIT","GOD MODE"]}'
);

INSERT OR REPLACE INTO projects(
  id, name, status, canonical_repo, canonical_source, metadata_json
) VALUES (
  'ogenic-platform',
  'OGENIC Phase VI Platform',
  'active',
  'Ogenicchocolate21debug/Build-Platform',
  'cloudflare-d1',
  '{"phase":"VI","toolkit_count":1,"primary_runtime":"cloudflare","production_promotion":"approval_required"}'
);

-- Source registry. GitHub owns code/schema; D1 owns operational state after cutover;
-- Notion is a migration source until its import is verified.
INSERT OR REPLACE INTO canonical_sources(
  id, provider_id, external_id, title, canonical_url, source_kind, status,
  precedence, source_last_edited_at, content_hash, migration_status, metadata_json
) VALUES
  ('github-build-platform','github','Ogenicchocolate21debug/Build-Platform','Build-Platform Phase VI','https://github.com/Ogenicchocolate21debug/Build-Platform','source_code','canonical',10,NULL,NULL,'native','{"scope":"code, schema, migrations, CI/CD"}'),
  ('notion-core-harness-master','notion','3d152a91-3871-8112-bab0-c3f2639d96f5','OGENIC CORE HARNESS — Enterprise Infrastructure & Operate Master','https://app.notion.com/p/3d152a9138718112bab0c3f2639d96f5','legacy_operating_knowledge','migration_source',50,'2026-09-05T17:40:43.598Z','5dc3a2f5637f245632910aaa2e57aaffb98dd02c5e19dabcc0f5a427b65fcfc0','normalized','{"note":"General OGENIC architecture normalized into Phase VI; stale Candy-specific A1-A5 content is not promoted into system state."}');

INSERT OR REPLACE INTO migration_sources(
  id, provider_id, source_ref, status, last_cursor, imported_count, error_count
) VALUES
  ('notion-core-harness-master','notion','3d152a91-3871-8112-bab0-c3f2639d96f5','normalized',NULL,1,0);

-- Ten canonical operating planes migrated from the legacy Operate Master.
INSERT OR REPLACE INTO system_planes(id, ordinal, name, description, status, source_id) VALUES
  ('control',1,'Command & Solution Architecture','Intent routing, system/API/MCP architecture, policy gates and source precedence.','active','notion-core-harness-master'),
  ('knowledge',2,'Knowledge & Context Fabric','Canonical context, RAG, source registry, executable operating knowledge and migration.','active','notion-core-harness-master'),
  ('development',3,'Development & Source Fabric','Code, Git, packages, build, test, lint and CI/CD.','active','notion-core-harness-master'),
  ('execution',4,'X — Execution Fabric','Tools, processes, filesystem/browser and cloud execution surfaces.','active','notion-core-harness-master'),
  ('identity',5,'Y — Identity & Session Continuity','Machine Identity, session health, capability broker, OIDC and Infisical references.','active','notion-core-harness-master'),
  ('convergence',6,'Z — Convergence & Workflow Fabric','Desired-vs-actual reconciliation, diff, test, promote and rollback.','active','notion-core-harness-master'),
  ('data',7,'Data & Storage Fabric','D1 operational state, Drive source files/assets, manifests, hashes and storage.','active','notion-core-harness-master'),
  ('observability',8,'Observability & Governance','Logs, metrics, traces, audit, correlation, idempotency, retries and IAM.','active','notion-core-harness-master'),
  ('agents',9,'Agent & Intelligence Runtime','ChatGPT, Codex and future agents as replaceable workloads behind capabilities.','active','notion-core-harness-master'),
  ('business',10,'Product & Business Connectors','Apps, commerce, delivery, social, communications and connector provisioning.','active','notion-core-harness-master');

-- Capability registry base data. IDs match config/capabilities.json.
INSERT OR IGNORE INTO capabilities(id, plane, permission_class, description) VALUES
  ('intent_route','control','READ','Classify user intent into a canonical capability.'),
  ('capability_resolve','control','READ','Resolve capability before selecting a provider.'),
  ('policy_gate','control','READ','Apply policy and approval rules.'),
  ('source_precedence','control','READ','Resolve canonical source precedence.'),
  ('knowledge_search','knowledge','READ','Search canonical operating knowledge.'),
  ('context_load','knowledge','READ','Load minimum canonical context required.'),
  ('knowledge_write','knowledge','WRITE','Persist verified operating knowledge.'),
  ('migration_import','knowledge','WRITE','Import a verified legacy source into canonical state.'),
  ('code_search','development','READ','Search code and repository artifacts.'),
  ('read_file','development','READ','Read source files.'),
  ('write_file','development','WRITE','Create or patch source files.'),
  ('git_diff','development','READ','Inspect minimal code differences.'),
  ('git_commit','development','WRITE','Commit verified changes.'),
  ('test','development','EXECUTE','Run tests.'),
  ('lint','development','EXECUTE','Run lint checks.'),
  ('build','development','EXECUTE','Build application artifacts.'),
  ('provider_discover','execution','READ','Discover a runtime/provider binding.'),
  ('workflow_run','execution','EXECUTE','Execute a workflow/job.'),
  ('deploy_preview','execution','EXECUTE','Deploy a staging or preview environment.'),
  ('deploy_promote','execution','DANGEROUS','Promote a verified deployment to production.'),
  ('runtime_verify','execution','READ','Verify runtime health and output.'),
  ('identity_health','identity','READ','Check workload identity readiness without exposing secrets.'),
  ('session_health','identity','READ','Check provider/session state.'),
  ('credential_reference','identity','READ','Resolve a secret reference, never raw secret content.'),
  ('reauth_required','identity','WRITE','Persist a provider reauthentication requirement.'),
  ('snapshot','convergence','READ','Capture a reproducible state snapshot.'),
  ('hash','convergence','READ','Hash canonical artifacts for drift detection.'),
  ('diff','convergence','READ','Compare desired and actual state.'),
  ('reconcile','convergence','WRITE','Apply a minimal reconciliation.'),
  ('rollback','convergence','DANGEROUS','Rollback a failed or unwanted change.'),
  ('audit','convergence','WRITE','Persist audit evidence.'),
  ('drive_scan','data','READ','Scan Drive source structure.'),
  ('asset_index','data','WRITE','Index binary/source assets.'),
  ('manifest_build','data','WRITE','Build a source manifest.'),
  ('sql_query','data','READ','Query canonical D1 state.'),
  ('data_validate','data','READ','Validate data integrity.'),
  ('logs','observability','READ','Read runtime logs.'),
  ('metrics','observability','READ','Read system metrics.'),
  ('traces','observability','READ','Read execution traces.'),
  ('incident_report','observability','WRITE','Persist an incident/recovery report.'),
  ('agent_register','agents','WRITE','Register an agent runtime.'),
  ('agent_handoff','agents','WRITE','Persist a recoverable agent handoff.'),
  ('agent_delegate','agents','EXECUTE','Delegate work to a bound agent.'),
  ('agent_capability_map','agents','READ','Resolve agent capabilities.'),
  ('app_scan','business','READ','Inspect an application/connector surface.'),
  ('app_build','business','EXECUTE','Build an application surface.'),
  ('app_preview','business','EXECUTE','Create a preview application deployment.'),
  ('app_verify','business','READ','Verify an application deployment.'),
  ('connector_provision','business','WRITE','Provision a provider/connector binding.');

INSERT OR REPLACE INTO command_aliases(alias, capability_id, description, enabled, source_id) VALUES
  ('/OG.help','capability_resolve','Show the Phase VI command/capability map.',1,'notion-core-harness-master'),
  ('/OG.status','runtime_verify','Show system, database and provider health.',1,'notion-core-harness-master'),
  ('/OG.tools','provider_discover','Discover available provider bindings.',1,'notion-core-harness-master'),
  ('/OG.context','context_load','Load canonical operating context.',1,'notion-core-harness-master'),
  ('/OG.sync','reconcile','Reconcile desired and actual state.',1,'notion-core-harness-master'),
  ('/OG.audit','audit','Read or persist audit evidence.',1,'notion-core-harness-master'),
  ('/OG.deploy','deploy_preview','Deploy a staging/preview build.',1,'github-build-platform'),
  ('/OG.promote','deploy_promote','Promote to production only after explicit approval.',1,'github-build-platform'),
  ('/X.tools','provider_discover','Inspect execution surfaces.',1,'notion-core-harness-master'),
  ('/Y.health','identity_health','Inspect identity/session readiness.',1,'notion-core-harness-master'),
  ('/Z.reconcile','reconcile','Run convergence reconciliation.',1,'notion-core-harness-master');

INSERT OR REPLACE INTO policy_rules(id, scope, rule_text, enforcement, enabled, source_id) VALUES
  ('read-before-write','global','Read the target and canonical source before writing.','required',1,'notion-core-harness-master'),
  ('minimal-reversible-diff','global','Use the smallest reversible change and preserve unrelated state.','required',1,'notion-core-harness-master'),
  ('discover-before-provider','routing','Discover capability before selecting a provider/runtime.','required',1,'notion-core-harness-master'),
  ('no-raw-secrets','identity','Never persist or expose raw credentials; D1 stores secret references only.','required',1,'github-build-platform'),
  ('cloudflare-primary','runtime','Cloudflare is the primary Phase VI runtime.','required',1,'github-build-platform'),
  ('d1-canonical-state','data','D1 becomes canonical operational state after verified migration.','required',1,'github-build-platform'),
  ('drive-binary-source','data','Google Drive remains source-file and binary asset storage.','required',1,'github-build-platform'),
  ('github-code-ci','development','GitHub remains canonical source code, migrations and CI/CD.','required',1,'github-build-platform'),
  ('infisical-secret-source','identity','Infisical remains the secret source and machine-identity authority.','required',1,'github-build-platform'),
  ('notion-n8n-migration-only','migration','Notion and n8n are migration sources until verified cutover; do not create new hard dependencies on them.','required',1,'github-build-platform'),
  ('production-approval','deployment','Production promotion requires explicit user approval after staging verification.','required',1,'notion-core-harness-master'),
  ('persist-operating-knowledge','knowledge','Persist decisions, constraints, canonical references and verified outcomes; never hidden chain-of-thought.','required',1,'notion-core-harness-master');

-- Normalized legacy Operate Master. Candy-specific legacy A1-A5 details are intentionally
-- excluded from Phase VI operating state because Candy has its own current source of truth.
INSERT OR REPLACE INTO knowledge_documents(
  id, project_id, source_id, title, body, format, canonical, content_hash,
  source_last_edited_at, metadata_json
) VALUES (
  'ogenic-core-harness-normalized-v1',
  'ogenic-platform',
  'notion-core-harness-master',
  'OGENIC CORE HARNESS — normalized Phase VI operating contract',
  'OGENIC CORE HARNESS is the one-toolkit control plane. Operate contract: Intent → Retrieve Canonical Context → Discover Capability → Plan Minimal Diff → Execute → Verify → Persist Result → Report. Ten planes: Command & Solution Architecture; Knowledge & Context Fabric; Development & Source Fabric; X — Execution Fabric; Y — Identity & Session Continuity; Z — Convergence & Workflow Fabric; Data & Storage Fabric; Observability & Governance; Agent & Intelligence Runtime; Product & Business Connectors. Persist operating knowledge, decisions, constraints, canonical paths, capability contracts, verified outcomes and auth/session health metadata without raw credentials or hidden model reasoning. Cloudflare is primary runtime; D1 is canonical operational state after cutover; GitHub owns code/schema/CI; Drive owns binary/source files; Infisical owns secrets and Machine Identity; Notion and n8n are migration sources until verified retirement.',
  'text',
  1,
  '5dc3a2f5637f245632910aaa2e57aaffb98dd02c5e19dabcc0f5a427b65fcfc0',
  '2026-09-05T17:40:43.598Z',
  '{"migration":"normalized","source_page":"3d152a91-3871-8112-bab0-c3f2639d96f5","excluded_from_promotion":["stale Candy A1-A5 website details"]}'
);

INSERT OR REPLACE INTO knowledge_index(
  id, project_id, source_provider, source_id, title, canonical_ref, content_hash, metadata_json
) VALUES (
  'ogenic-core-harness-normalized-v1',
  'ogenic-platform',
  'notion',
  '3d152a91-3871-8112-bab0-c3f2639d96f5',
  'OGENIC CORE HARNESS — normalized Phase VI operating contract',
  'd1:knowledge_documents/ogenic-core-harness-normalized-v1',
  '5dc3a2f5637f245632910aaa2e57aaffb98dd02c5e19dabcc0f5a427b65fcfc0',
  '{"canonical":true,"phase":"VI"}'
);

-- Provider bindings contain references/status only. No secret value is inserted here.
INSERT OR REPLACE INTO provider_bindings(id, provider_id, environment, binding_type, secret_ref, status, metadata_json) VALUES
  ('cloudflare-prod-api','cloudflare','prod','api_token','/providers/cloudflare/prod','verified','{"runtime":"workers","database":"d1"}'),
  ('github-prod','github','prod','github_app_or_token','/providers/github/prod','verified','{"repo":"Ogenicchocolate21debug/Build-Platform"}'),
  ('infisical-prod','infisical','prod','machine_identity',NULL,'configured','{"raw_secrets_in_d1":false}'),
  ('google-drive-prod','google_drive','prod','oauth_or_service_account','/providers/google-drive/prod','configured','{"role":"binary_and_source_files"}'),
  ('linear-prod','linear','prod','oauth_or_api','/providers/linear/prod','configured','{"role":"tasks_and_agents"}'),
  ('notion-migration','notion','migration','oauth','/providers/notion/prod','migration','{"retire_after_verified_import":true}'),
  ('n8n-migration','n8n','migration','api_or_webhook','/providers/n8n/prod','migration','{"optional_after_cutover":true}');

INSERT OR REPLACE INTO system_meta(key, value) VALUES
  ('canonical_repo', 'Ogenicchocolate21debug/Build-Platform'),
  ('canonical_toolkit', 'ogenic-core'),
  ('canonical_operating_state', 'd1'),
  ('legacy_knowledge_source', 'notion:migration'),
  ('secret_source', 'infisical'),
  ('binary_source', 'google_drive'),
  ('production_promotion', 'explicit_approval_required'),
  ('notion_core_harness_migration', 'normalized');

INSERT INTO audit_log(correlation_id, actor, action, target, status, detail_json)
VALUES (
  'phase-vi-notion-bootstrap',
  'migration',
  'normalize_legacy_operate_master',
  'notion:3d152a91-3871-8112-bab0-c3f2639d96f5',
  'success',
  '{"destination":"cloudflare-d1","raw_secrets":false,"stale_candy_content_promoted":false}'
);
