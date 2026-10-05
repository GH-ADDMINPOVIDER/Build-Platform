PRAGMA foreign_keys = ON;

-- OGE-35 reconciliation only: canonical D1 operational metadata lagged behind
-- verified staging runtime evidence from OGE-34. This migration changes no schema
-- and stores no raw credentials. It records only provider binding references/status.

INSERT OR REPLACE INTO provider_bindings(
  id,
  provider_id,
  environment,
  binding_type,
  secret_ref,
  status,
  last_checked_at,
  metadata_json
) VALUES
  (
    'github-staging',
    'github',
    'staging',
    'github_app_or_token',
    '/providers/github/prod',
    'verified',
    CURRENT_TIMESTAMP,
    '{"proof":"OGE-34","github_private_repo_read":true,"github_actions_read":true,"proof_run_id":37269914760,"raw_secrets_in_d1":false}'
  ),
  (
    'cloudflare-staging',
    'cloudflare',
    'staging',
    'api_token',
    '/providers/cloudflare/prod',
    'verified',
    CURRENT_TIMESTAMP,
    '{"proof":"OGE-34","worker_credential_refresh":true,"athena_runtime_proof":true,"proof_run_id":37269914760,"raw_secrets_in_d1":false}'
  );

INSERT INTO audit_log(
  correlation_id,
  actor,
  action,
  target,
  status,
  detail_json
) VALUES (
  'oge-35-staging-binding-reconcile',
  'yellow-stone',
  'reconcile_provider_binding_metadata',
  'github+cloudflare:staging',
  'success',
  '{"basis":"OGE-34 verified runtime evidence","schema_changed":false,"raw_secrets_persisted":false}'
);
