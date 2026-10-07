PRAGMA foreign_keys = ON;

-- OGE-70 data-only reconciliation.
-- No schema changes and no raw secret values.
-- Promotes the verified self-host n8n staging runtime from migration source
-- to an optional execution fabric behind MA-OP / Yellow Stone.

UPDATE providers
SET
  role = 'workflow_execution_fabric',
  status = 'active',
  auth_type = 'api_key',
  secret_ref = 'infisical:staging:N8N_SELFHOST_API_KEY',
  updated_at = CURRENT_TIMESTAMP
WHERE id = 'n8n';

INSERT OR REPLACE INTO provider_capabilities(
  provider_id,
  capability_id,
  priority,
  enabled
) VALUES (
  'n8n',
  'workflow_run',
  10,
  1
);

INSERT OR REPLACE INTO provider_bindings(
  id,
  provider_id,
  environment,
  binding_type,
  secret_ref,
  status,
  last_checked_at,
  metadata_json
) VALUES (
  'n8n-staging',
  'n8n',
  'staging',
  'api_key',
  'infisical:staging:N8N_SELFHOST_API_KEY',
  'verified',
  CURRENT_TIMESTAMP,
  '{"proof":"OGE-70","runtime":"self_host","host":"n8n-staging-76b7.up.railway.app","api_auth_verified":true,"workflow_modules_inactive_by_default":true,"control_plane":"MAOP_YELLOW","raw_secrets_in_d1":false}'
);

INSERT OR REPLACE INTO connector_definitions(
  id,
  provider_id,
  role,
  auth_model,
  secret_path,
  lifecycle,
  source_id,
  metadata_json
) VALUES (
  'n8n-selfhost-staging',
  'n8n',
  'workflow_execution_fabric',
  'api_key',
  'infisical:staging:N8N_SELFHOST_API_KEY',
  'active',
  'github-build-platform',
  '{"oge":"OGE-70","control_plane":"MAOP_YELLOW","verification":"RUBY_STONE","retention":"GREEN_1LSS","public_workflow_activation":false}'
);

INSERT OR REPLACE INTO system_meta(key, value, updated_at) VALUES
  ('n8n_role', 'workflow_execution_fabric_optional_adapter', CURRENT_TIMESTAMP);

INSERT INTO audit_log(
  correlation_id,
  actor,
  action,
  target,
  status,
  detail_json
) VALUES (
  'oge-70-n8n-execution-fabric-reconcile',
  'yellow-stone',
  'reconcile_provider_binding_metadata',
  'n8n:staging',
  'success',
  '{"basis":"OGE-69 live-connect + OGE-70 module proof","schema_changed":false,"raw_secrets_persisted":false,"workflow_execution_auto_allowed":false}'
);
