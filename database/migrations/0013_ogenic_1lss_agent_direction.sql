PRAGMA foreign_keys = ON;

-- OGENIC PHASE VI
-- Harness Capability
-- Type : OGENIC 1LSS — Auto Session Access
-- Canonical direction shared through D1/RAG for OGENIC agents.

INSERT OR IGNORE INTO providers(id, role, status, auth_type, secret_ref, config_json)
VALUES (
  'deepseek',
  'planned_specialist_agent',
  'planned',
  'api_key',
  '/providers/deepseek/staging',
  '{"routing":"disabled_until_verified","environment":"staging","raw_secret_in_d1":false}'
);

INSERT OR REPLACE INTO canonical_sources(
  id, provider_id, external_id, title, canonical_url, source_kind, status,
  precedence, source_last_edited_at, content_hash, migration_status, metadata_json
) VALUES (
  'ogenic-1lss-auto-session-access-plan',
  'github',
  'docs/phase-vi/OGENIC_1LSS_AUTO_SESSION_ACCESS.md',
  'OGENIC PHASE VI — Harness Capability — OGENIC 1LSS Auto Session Access',
  'https://github.com/Ogenicchocolate21debug/Build-Platform/blob/phase-vi-provider-incentive-metering/docs/phase-vi/OGENIC_1LSS_AUTO_SESSION_ACCESS.md',
  'product_direction',
  'canonical',
  5,
  '2026-09-19T23:00:00+07:00',
  NULL,
  'native',
  '{"phase":"VI","harness":"Harness Capability","type":"OGENIC 1LSS — Auto Session Access","runtime":"cloudflare","mobile_first":true,"destinations":["openai_case_study","apple_application"],"deepseek":"planned"}'
);

INSERT OR REPLACE INTO knowledge_documents(
  id, project_id, source_id, title, body, format, canonical, content_hash,
  source_last_edited_at, metadata_json
) VALUES (
  'ogenic-1lss-auto-session-access-v1',
  'ogenic-platform',
  'ogenic-1lss-auto-session-access-plan',
  'OGENIC 1LSS — Auto Session Access — canonical agent direction',
  'OGENIC PHASE VI / Harness Capability / Type: OGENIC 1LSS — Auto Session Access. Product direction: build a mobile-first federated AI operating layer with one continuous owner session. D1 is canonical operational memory and project-direction storage. owner-main and 1LSS_OWNER_MAIN are one ordered life line; source surfaces are doors into the same truth, not separate memories. Every OGENIC agent or delegated specialist must load canonical D1 direction before planning or execution and should return verified outcomes to shared state. Cloudflare is the primary full-stack runtime for Assets, Worker APIs, D1, Session/Auth, Browser, Builds/Deploy and runtime health. GitHub remains canonical source/version control; prefer Cloudflare-native build/deploy for Cloudflare runtime work when available to preserve GitHub Actions capacity. Route platform-specific work to platform-native agents or execution surfaces when available, with OGENIC acting as supervisor/capability router. Human approval gates side effects. Product destinations: demonstrable OpenAI case study/proposal and a commercial Apple application with mobile as the control plane for a distributed AI ecosystem. Current milestone: verify session continuity across /chat and /app, D1 canonical memory/RAG, agent-context handoff, owner auth and approval. DeepSeek is a planned specialist provider only; do not route work to it until adapter, credential binding, capability map and runtime verification are complete. Staging first; do not touch main, production or Candy without explicit approval; never expose raw secrets or claim unverified state.',
  'markdown',
  1,
  NULL,
  '2026-09-19T23:00:00+07:00',
  '{"canonical":true,"phase":"VI","scope":"agent_direction","rag":"d1_canonical","session":"1LSS_OWNER_MAIN","deepseek":"planned_not_bound"}'
);

INSERT OR REPLACE INTO knowledge_index(
  id, project_id, source_provider, source_id, title, canonical_ref, content_hash, metadata_json
) VALUES (
  'ogenic-1lss-auto-session-access-v1',
  'ogenic-platform',
  'github',
  'docs/phase-vi/OGENIC_1LSS_AUTO_SESSION_ACCESS.md',
  'OGENIC 1LSS — Auto Session Access — canonical agent direction',
  'd1:knowledge_documents/ogenic-1lss-auto-session-access-v1',
  NULL,
  '{"canonical":true,"phase":"VI","rag":"d1_canonical","agent_shared_direction":true}'
);

INSERT OR REPLACE INTO system_meta(key, value) VALUES
  ('current_program', 'OGENIC PHASE VI'),
  ('current_harness', 'Harness Capability'),
  ('current_type', 'OGENIC 1LSS — Auto Session Access'),
  ('agent_architecture', 'federated_agent_supervisor'),
  ('agent_shared_direction_source', 'd1:knowledge_documents/ogenic-1lss-auto-session-access-v1'),
  ('primary_runtime', 'cloudflare'),
  ('cloudflare_runtime_scope', 'assets+worker+d1+session+browser+builds+deploy+health'),
  ('github_runtime_role', 'canonical_source+version_control+review'),
  ('product_destination_openai', 'case_study_or_proposal'),
  ('product_destination_apple', 'commercial_mobile_application'),
  ('deepseek_status', 'planned_not_bound');

UPDATE policy_rules
SET rule_text = 'GitHub remains canonical source code, schema and version control. Prefer Cloudflare-native build/deploy for Cloudflare runtime work when available so GitHub Actions is reserved for runner-specific verification and source workflows.',
    updated_at = CURRENT_TIMESTAMP
WHERE id = 'github-code-ci';

INSERT OR REPLACE INTO policy_rules(id, scope, rule_text, enforcement, enabled, source_id) VALUES
  ('agent-load-canonical-direction','agents','Before planning or delegated execution, load the current canonical OGENIC project direction from D1 and preserve 1LSS continuity.','required',1,'ogenic-1lss-auto-session-access-plan'),
  ('agent-return-verified-outcome','agents','Delegated agents should return verified outcomes and handoff metadata to shared OGENIC state instead of creating an isolated source of truth.','required',1,'ogenic-1lss-auto-session-access-plan'),
  ('native-agent-capability-routing','routing','Prefer the platform-native agent or execution surface for platform-specific work when it is available, authorized and appropriate; OGENIC remains the supervisor and approval gate.','required',1,'ogenic-1lss-auto-session-access-plan'),
  ('deepseek-verification-gate','routing','DeepSeek is planned only. Do not route work to DeepSeek until its adapter, server-side credential binding, capability map and runtime verification are complete.','required',1,'ogenic-1lss-auto-session-access-plan'),
  ('mobile-control-plane','product','Preserve mobile-first operation: the mobile client is a control plane for distributed runtime and agent capabilities, not a requirement to run heavy compute locally.','required',1,'ogenic-1lss-auto-session-access-plan');

INSERT INTO audit_log(correlation_id, actor, action, target, status, detail_json)
VALUES (
  'ogenic-1lss-agent-direction-2026-09-19',
  'migration',
  'register_canonical_agent_direction',
  'd1:knowledge_documents/ogenic-1lss-auto-session-access-v1',
  'success',
  '{"phase":"VI","rag":"d1_canonical","shared_agents":true,"deepseek":"planned_not_bound","raw_secrets":false}'
);
