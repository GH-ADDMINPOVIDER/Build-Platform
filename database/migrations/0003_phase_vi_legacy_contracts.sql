PRAGMA foreign_keys = ON;

-- Normalize current supporting Notion contracts into Phase VI D1.
-- These are migration sources, not new canonical control planes.

CREATE TABLE IF NOT EXISTS connector_definitions (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL,
  role TEXT NOT NULL,
  auth_model TEXT NOT NULL,
  secret_path TEXT,
  lifecycle TEXT NOT NULL DEFAULT 'active',
  source_id TEXT,
  metadata_json TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE,
  FOREIGN KEY (source_id) REFERENCES canonical_sources(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS credential_name_registry (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL,
  credential_name TEXT NOT NULL,
  required INTEGER NOT NULL DEFAULT 0,
  purpose TEXT,
  source_id TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(provider_id, credential_name),
  FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE,
  FOREIGN KEY (source_id) REFERENCES canonical_sources(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_connector_definitions_provider
  ON connector_definitions(provider_id, lifecycle);
CREATE INDEX IF NOT EXISTS idx_credential_registry_provider
  ON credential_name_registry(provider_id, required);

-- Ensure providers referenced by historical/current connector contracts exist.
INSERT OR IGNORE INTO providers(id, role, status, auth_type, secret_ref) VALUES
  ('openai','agent_runtime','configured','api_or_oauth','/providers/openai/prod'),
  ('line_oa','messaging_connector','migration','token_secret','/providers/line/prod'),
  ('meta','social_connector','migration','oauth_token','/providers/meta/prod'),
  ('grabfood','delivery_connector','migration','oauth_client','/providers/grabfood/prod'),
  ('shopeefood','delivery_connector','migration','oauth_client','/providers/shopeefood/prod'),
  ('tiktok_shop','commerce_connector','migration','oauth_token','/providers/tiktok-shop/prod'),
  ('gmail','communication_connector','configured','oauth','/providers/google/prod'),
  ('google_services','productivity_connector','configured','oauth_or_service_account','/providers/google/prod'),
  ('shopify','legacy_commerce','retiring','oauth_or_token','/providers/shopify/prod'),
  ('atlassian','optional_legacy_tasks','optional','oauth_or_token','/providers/atlassian/prod'),
  ('exa','optional_search','optional','api_key','/providers/exa/prod');

-- Supporting source registry.
INSERT OR REPLACE INTO canonical_sources(
  id, provider_id, external_id, title, canonical_url, source_kind, status,
  precedence, source_last_edited_at, content_hash, migration_status, metadata_json
) VALUES
  ('notion-ai-handoff-2026-08-19','notion','3c052a91-3871-8160-b477-d9cefe30e2c7','OGENIC — AI Project Context Handoff — 2026-08-19','https://app.notion.com/p/3c052a9138718160b477d9cefe30e2c7','supporting_handoff','migration_source',30,'2026-09-05T17:40:54.079Z',NULL,'normalized','{"superseded_roles":{"n8n":"optional/migration","notion":"migration source","shopify":"retiring"},"current_overlay":"HARNESS/Phase VI"}'),
  ('notion-xyz-blueprint-2026-09-04','notion','3d052a91-3871-81df-8141-d0fa9a1a4061','OGENIC HARNESS — X-Y-Z Systems Blueprint — 2026-09-04','https://app.notion.com/p/3d052a91387181df8141d0fa9a1a4061','supporting_architecture','migration_source',20,NULL,NULL,'normalized','{"planes":["X execution","Y identity/session continuity","Z convergence/reconciliation"]}'),
  ('notion-workflow-command-center','notion','3cc52a91-3871-81cc-8732-db171f15d2aa','OGENIC — Workflow Shortcut Command Center','https://app.notion.com/p/3cc52a91387181cc8732db171f15d2aa','command_contract','migration_source',25,NULL,NULL,'normalized','{"legacy_layer":"/WF.*","canonical_layer":"/OG.* + /X + /Y + /Z"}'),
  ('notion-bootstrap-ops','notion','3cc52a91-3871-8126-ac15-f37d1b220778','Developer System-Bootstrap Ops — WF + Secret + Build','https://app.notion.com/p/3cc52a9138718126ac15f37d1b220778','bootstrap_ops','migration_source',35,'2026-09-02T23:29:50.930Z',NULL,'normalized','{"legacy_business_details":"inventory/audit only","safe_ops":"preserve/reuse/audit/verify"}'),
  ('notion-mcp-part3','notion','3c752a91-3871-815b-908d-ca55e756b88b','03 — MCP & Connector Implementation — Part 3','https://app.notion.com/p/3c752a913871815b908dca55e756b88b','connector_implementation','migration_source',35,'2026-08-26T16:42:37.030Z',NULL,'normalized','{"n8n_snapshot_nodes":119,"vercel_mcp":"legacy/custom endpoint, not control plane","outbound_test_lanes":"legacy"}');

INSERT OR REPLACE INTO migration_sources(id, provider_id, source_ref, status, last_cursor, imported_count, error_count) VALUES
  ('notion-ai-handoff-2026-08-19','notion','3c052a91-3871-8160-b477-d9cefe30e2c7','normalized',NULL,1,0),
  ('notion-xyz-blueprint-2026-09-04','notion','3d052a91-3871-81df-8141-d0fa9a1a4061','normalized',NULL,1,0),
  ('notion-workflow-command-center','notion','3cc52a91-3871-81cc-8732-db171f15d2aa','normalized',NULL,1,0),
  ('notion-bootstrap-ops','notion','3cc52a91-3871-8126-ac15-f37d1b220778','normalized',NULL,1,0),
  ('notion-mcp-part3','notion','3c752a91-3871-815b-908d-ca55e756b88b','normalized',NULL,1,0);

-- Normalized knowledge only: preserve the durable contract, not stale implementation state.
INSERT OR REPLACE INTO knowledge_documents(
  id, project_id, source_id, title, body, format, canonical,
  content_hash, source_last_edited_at, metadata_json
) VALUES
  ('phase-vi-handoff-normalized','ogenic-platform','notion-ai-handoff-2026-08-19','Phase VI normalized AI handoff contract',
   'Preserve architecture; discover the capability registry before adding integrations; never persist raw credentials; use least privilege and runtime token lifecycles; keep correlation/event identifiers, idempotency, webhook verification, retry/dead-letter and audit semantics; production requires explicit approval. Current HARNESS vocabulary for runtime gaps is CAPABILITY_REQUIRED or UNBOUND_CAPABILITY. Historical CONFIGURATION_REQUIRED remains useful for legacy connector configuration gaps. Phase VI supersedes historical assumptions that n8n and Notion are primary control/state systems: Cloudflare is the primary runtime, D1 is canonical operational state after cutover, GitHub owns code/migrations/CI, Drive owns binary/source files, and Infisical owns secrets/Machine Identity.',
   'text',1,NULL,'2026-09-05T17:40:54.079Z','{"normalized_from":"2026-08-19 handoff + 2026-09-06 HARNESS overlay"}'),
  ('phase-vi-xyz-normalized','ogenic-platform','notion-xyz-blueprint-2026-09-04','Phase VI X/Y/Z contract',
   'X is execution fabric: tools are execution surfaces chosen by the Harness, not the architecture itself. Y is identity/session continuity: Machine Identity to trusted runtime to session/credential broker to scoped capability; distribute capabilities, not secrets; prefer short-lived credentials and auditable token exchange. Z is convergence: snapshot, hash, diff, validate, test, promote and rollback desired versus actual state. Chat is the operator console. Executable memory belongs in repo contracts, scripts, skills, playbooks and recovery/deploy recipes. Secret managers hold secret values; the Harness holds identity, policy and capability grants.',
   'text',1,NULL,NULL,'{"phase":"VI","planes":["X","Y","Z"]}'),
  ('phase-vi-command-normalized','ogenic-platform','notion-workflow-command-center','Phase VI command-layer compatibility contract',
   '/OG.* plus /X.tools, /Y.health and /Z.reconcile is the canonical command layer. /WF.* remains a legacy compatibility layer and may route into OGENIC CORE. Secret handling follows EXISTING → VERIFY → PRESERVE → REUSE. Infisical is secret source; encrypted CI secrets may be a runtime bridge; Notion, Drive, logs, code and chat store names/references only. TEST/DRY_RUN and explicit approval remain required for unverified or high-risk production actions.',
   'text',1,NULL,NULL,'{"legacy_alias_family":"/WF.*","canonical_alias_family":"/OG.*"}'),
  ('phase-vi-bootstrap-normalized','ogenic-platform','notion-bootstrap-ops','Phase VI bootstrap and reversible-operations contract',
   'Bootstrap flow is Inspect → Resolve target → Check secret metadata → Develop → Build → Audit → Deploy → Verify → Save version. Prefer non-destructive operations: copy only missing data, version conflicts, never silently overwrite/delete, verify filename/type/size or equivalent integrity metadata, build and audit before deployment, and preserve rollback evidence. Historical Shopify/photo counts and category snapshots remain audit history and are not promoted as current system state.',
   'text',0,NULL,'2026-09-02T23:29:50.930Z','{"scope":"durable operations only","historical_business_snapshots":"not canonical"}'),
  ('phase-vi-connectors-normalized','ogenic-platform','notion-mcp-part3','Phase VI connector and credential-reference contract',
   'Connector definitions store provider auth model, credential names and secret references only. A Machine Identity authorizes the workload to retrieve scoped credentials from Infisical; it does not replace each provider OAuth/API credential. Missing provider authorization becomes CAPABILITY_REQUIRED or a connector configuration state. Historical n8n gateway and Vercel MCP endpoints are migration/legacy surfaces, not the Phase VI control plane. n8n may remain optional for complex visual workflows after export and classification.',
   'text',1,NULL,'2026-08-26T16:42:37.030Z','{"n8n_snapshot_nodes":119,"raw_secret_values":false}');

INSERT OR REPLACE INTO knowledge_index(id, project_id, source_provider, source_id, title, canonical_ref, content_hash, metadata_json) VALUES
  ('phase-vi-handoff-normalized','ogenic-platform','notion','3c052a91-3871-8160-b477-d9cefe30e2c7','Phase VI normalized AI handoff contract','d1:knowledge_documents/phase-vi-handoff-normalized',NULL,'{"canonical":true}'),
  ('phase-vi-xyz-normalized','ogenic-platform','notion','3d052a91-3871-81df-8141-d0fa9a1a4061','Phase VI X/Y/Z contract','d1:knowledge_documents/phase-vi-xyz-normalized',NULL,'{"canonical":true}'),
  ('phase-vi-command-normalized','ogenic-platform','notion','3cc52a91-3871-81cc-8732-db171f15d2aa','Phase VI command-layer compatibility contract','d1:knowledge_documents/phase-vi-command-normalized',NULL,'{"canonical":true}'),
  ('phase-vi-bootstrap-normalized','ogenic-platform','notion','3cc52a91-3871-8126-ac15-f37d1b220778','Phase VI bootstrap and reversible-operations contract','d1:knowledge_documents/phase-vi-bootstrap-normalized',NULL,'{"canonical":false}'),
  ('phase-vi-connectors-normalized','ogenic-platform','notion','3c752a91-3871-815b-908d-ca55e756b88b','Phase VI connector and credential-reference contract','d1:knowledge_documents/phase-vi-connectors-normalized',NULL,'{"canonical":true}');

-- Legacy /WF aliases retained for backwards-compatible user commands.
INSERT OR REPLACE INTO command_aliases(alias, capability_id, description, enabled, source_id) VALUES
  ('/WF.help','capability_resolve','Legacy compatibility: list command/capability requirements.',1,'notion-workflow-command-center'),
  ('/WF.index','context_load','Legacy compatibility: show connected workflow/data surfaces.',1,'notion-workflow-command-center'),
  ('/WF.sync.status','runtime_verify','Legacy compatibility: show sync/source/target status.',1,'notion-workflow-command-center'),
  ('/WF.audit.latest','audit','Legacy compatibility: show latest audit evidence.',1,'notion-workflow-command-center'),
  ('/WF.rollback.plan','diff','Legacy compatibility: prepare rollback plan without executing.',1,'notion-workflow-command-center'),
  ('/WF.OperateSecret.check','identity_health','Legacy compatibility: check secret-reference readiness without values.',1,'notion-workflow-command-center'),
  ('/WF.Tool.GodMode.find','capability_resolve','Legacy compatibility: route old GOD MODE lookup into OGENIC CORE.',1,'notion-workflow-command-center');

-- Durable identity/credential policies extracted from handoff and X/Y/Z.
INSERT OR REPLACE INTO policy_rules(id, scope, rule_text, enforcement, enabled, source_id) VALUES
  ('capabilities-not-secrets','identity','Distribute scoped capabilities to runtimes instead of distributing raw credentials.','required',1,'notion-xyz-blueprint-2026-09-04'),
  ('ephemeral-credential-preference','identity','Prefer identity proof, trusted token exchange and short-lived scoped credentials where supported.','required',1,'notion-xyz-blueprint-2026-09-04'),
  ('secret-zero-separation','identity','Do not store the secret-zero credential inside the same vault location it unlocks.','required',1,'notion-ai-handoff-2026-08-19'),
  ('webhook-verification','connectors','Verify provider webhook signatures/authentication before processing events.','required',1,'notion-ai-handoff-2026-08-19'),
  ('event-idempotency','connectors','Preserve correlation/event identifiers and enforce idempotency for event-driven writes.','required',1,'notion-ai-handoff-2026-08-19'),
  ('transient-retry-dlq','connectors','Retry transient failures only and preserve dead-letter/recovery evidence.','required',1,'notion-ai-handoff-2026-08-19'),
  ('legacy-n8n-not-control-plane','runtime','Historical n8n workflows are migration/optional execution surfaces and must not become the Phase VI control plane.','required',1,'notion-mcp-part3'),
  ('legacy-vercel-mcp-not-control-plane','runtime','Historical Vercel custom/template MCP is not the Phase VI control plane.','required',1,'notion-mcp-part3');

-- Connector catalog and secret-name metadata. No value is stored.
INSERT OR REPLACE INTO connector_definitions(id, provider_id, role, auth_model, secret_path, lifecycle, source_id, metadata_json) VALUES
  ('github-main','github','source_and_ci','github_app_or_builtin_token','/providers/github/prod','active','notion-ai-handoff-2026-08-19','{"built_in_actions_token":true}'),
  ('cloudflare-main','cloudflare','primary_runtime_and_sql','account_api_token','/providers/cloudflare/prod','active','notion-mcp-part3','{"runtime":"workers","database":"d1"}'),
  ('infisical-main','infisical','secret_and_identity_authority','machine_identity',NULL,'active','notion-xyz-blueprint-2026-09-04','{"raw_secret_values_in_d1":false}'),
  ('drive-main','google_drive','binary_and_source_files','oauth_or_service_account','/providers/google-drive/prod','active','notion-bootstrap-ops','{"binary_source":true}'),
  ('linear-main','linear','tasks_and_agent_delegation','oauth_or_api','/providers/linear/prod','active','notion-mcp-part3','{}'),
  ('openai-main','openai','agent_runtime','api_or_connected_runtime','/providers/openai/prod','active','notion-ai-handoff-2026-08-19','{}'),
  ('notion-migration-source','notion','legacy_knowledge','oauth','/providers/notion/prod','migration','notion-ai-handoff-2026-08-19','{"retire_after_verified_import":true}'),
  ('n8n-migration-source','n8n','legacy_workflow_engine','api_or_webhook','/providers/n8n/prod','migration','notion-mcp-part3','{"snapshot_nodes":119,"optional_after_cutover":true}'),
  ('shopify-retiring','shopify','legacy_commerce','oauth_or_token','/providers/shopify/prod','retiring','notion-ai-handoff-2026-08-19','{"replacement":"Cloudflare main; user chose to stop Shopify"}'),
  ('vercel-optional','vercel','legacy_deploy_or_mcp','oauth_or_token','/providers/vercel/prod','optional','notion-mcp-part3','{"not_control_plane":true}'),
  ('clickup-optional','clickup','legacy_task_connector','oauth_or_token','/providers/clickup/prod','optional','notion-mcp-part3','{}'),
  ('line-connector','line_oa','messaging','token_secret','/providers/line/prod','planned','notion-mcp-part3','{}'),
  ('meta-connector','meta','social','oauth_token','/providers/meta/prod','planned','notion-mcp-part3','{}'),
  ('grabfood-connector','grabfood','delivery','oauth_client','/providers/grabfood/prod','planned','notion-ai-handoff-2026-08-19','{}'),
  ('shopeefood-connector','shopeefood','delivery','oauth_client','/providers/shopeefood/prod','planned','notion-ai-handoff-2026-08-19','{}'),
  ('tiktok-shop-connector','tiktok_shop','commerce_social','oauth_token','/providers/tiktok-shop/prod','planned','notion-ai-handoff-2026-08-19','{}'),
  ('gmail-connector','gmail','communications','oauth','/providers/google/prod','planned','notion-ai-handoff-2026-08-19','{}'),
  ('google-services-connector','google_services','productivity','oauth_or_service_account','/providers/google/prod','active','notion-ai-handoff-2026-08-19','{}');

INSERT OR REPLACE INTO credential_name_registry(id, provider_id, credential_name, required, purpose, source_id) VALUES
  ('cf-account-id','cloudflare','CLOUDFLARE_ACCOUNT_ID',1,'Cloudflare account identifier; not a secret value.','notion-mcp-part3'),
  ('cf-api-token','cloudflare','CLOUDFLARE_API_TOKEN',1,'Scoped Cloudflare deployment/D1 authorization.','notion-mcp-part3'),
  ('github-app-id','github','GITHUB_APP_ID',0,'GitHub App integration identifier when App auth is used.','notion-ai-handoff-2026-08-19'),
  ('github-installation-id','github','GITHUB_INSTALLATION_ID',0,'GitHub App installation identifier.','notion-ai-handoff-2026-08-19'),
  ('github-private-key','github','GITHUB_PRIVATE_KEY',0,'GitHub App private key reference; never value.','notion-ai-handoff-2026-08-19'),
  ('notion-token','notion','NOTION_TOKEN',0,'Legacy Notion migration authorization.','notion-ai-handoff-2026-08-19'),
  ('line-access-token','line_oa','LINE_CHANNEL_ACCESS_TOKEN',0,'LINE OA channel access token reference.','notion-mcp-part3'),
  ('line-channel-secret','line_oa','LINE_CHANNEL_SECRET',0,'LINE OA webhook/signature secret reference.','notion-mcp-part3'),
  ('meta-app-id','meta','META_APP_ID',0,'Meta application identifier.','notion-mcp-part3'),
  ('meta-app-secret','meta','META_APP_SECRET',0,'Meta app secret reference.','notion-mcp-part3'),
  ('meta-access-token','meta','META_ACCESS_TOKEN',0,'Meta runtime token reference.','notion-mcp-part3'),
  ('linear-api-key','linear','LINEAR_API_KEY',0,'Linear API credential reference when OAuth is not used.','notion-mcp-part3'),
  ('vercel-token','vercel','VERCEL_TOKEN',0,'Optional legacy Vercel credential reference.','notion-mcp-part3'),
  ('clickup-api-key','clickup','CLICKUP_API_KEY',0,'Optional legacy ClickUp credential reference.','notion-mcp-part3'),
  ('openai-api-key','openai','OPENAI_API_KEY',0,'OpenAI API credential reference when API runtime is used.','notion-ai-handoff-2026-08-19');

INSERT OR REPLACE INTO system_meta(key, value) VALUES
  ('identity_model','machine_identity_to_scoped_capability'),
  ('legacy_command_layer','/WF.*'),
  ('canonical_command_layer','/OG.*'),
  ('n8n_role','migration_or_optional_execution'),
  ('vercel_role','optional_legacy_surface'),
  ('shopify_role','retiring'),
  ('connector_secret_values','infisical_only');

INSERT INTO audit_log(correlation_id, actor, action, target, status, detail_json) VALUES
  ('phase-vi-notion-supporting-contracts',
   'migration',
   'normalize_supporting_notion_contracts',
   'notion:handoff+xyz+commands+bootstrap+mcp-part3',
   'success',
   '{"destination":"cloudflare-d1","source_count":5,"raw_secret_values":false,"legacy_surfaces_promoted_to_control_plane":false}');
