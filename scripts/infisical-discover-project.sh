#!/usr/bin/env bash
set -euo pipefail

: "${INFISICAL_IDENTITY_ID:?missing INFISICAL_IDENTITY_ID}"
: "${INFISICAL_ORG_ID:?missing INFISICAL_ORG_ID}"
: "${INFISICAL_ORG_SLUG:?missing INFISICAL_ORG_SLUG}"
: "${ACTIONS_ID_TOKEN_REQUEST_TOKEN:?missing GitHub OIDC request token}"
: "${ACTIONS_ID_TOKEN_REQUEST_URL:?missing GitHub OIDC request URL}"

INFISICAL_API_URL="${INFISICAL_API_URL:-https://app.infisical.com}"
PREFERRED_ENV="${INFISICAL_ENV_SLUG:-staging}"

OIDC_RESPONSE="$(curl -sS \
  -H "Authorization: Bearer ${ACTIONS_ID_TOKEN_REQUEST_TOKEN}" \
  "${ACTIONS_ID_TOKEN_REQUEST_URL}")"
OIDC_JWT="$(printf '%s' "$OIDC_RESPONSE" | jq -r '.value // empty')"

if [ -z "$OIDC_JWT" ]; then
  echo "::error::Could not obtain GitHub OIDC JWT"
  exit 1
fi

LOGIN_PAYLOAD="$(jq -n \
  --arg identityId "$INFISICAL_IDENTITY_ID" \
  --arg jwt "$OIDC_JWT" \
  --arg organizationSlug "$INFISICAL_ORG_SLUG" \
  '{identityId:$identityId,jwt:$jwt,organizationSlug:$organizationSlug}')"

LOGIN_RESPONSE="$(curl -sS \
  -X POST \
  -H 'Content-Type: application/json' \
  --data "$LOGIN_PAYLOAD" \
  "${INFISICAL_API_URL}/api/v1/auth/oidc-auth/login")"

INFISICAL_TOKEN="$(printf '%s' "$LOGIN_RESPONSE" | jq -r '.accessToken // empty')"
if [ -z "$INFISICAL_TOKEN" ]; then
  MESSAGE="$(printf '%s' "$LOGIN_RESPONSE" | jq -r '.message // .error // "Infisical OIDC login failed"' 2>/dev/null || true)"
  echo "::error::${MESSAGE}"
  exit 1
fi

echo "::add-mask::${INFISICAL_TOKEN}"

PROJECTS_RESPONSE="$(curl -sS \
  -H "Authorization: Bearer ${INFISICAL_TOKEN}" \
  "${INFISICAL_API_URL}/api/v1/projects")"

PROJECTS="$(printf '%s' "$PROJECTS_RESPONSE" | jq -c --arg ORG "$INFISICAL_ORG_ID" '[.projects[]? | select(.orgId == $ORG)]')"
COUNT="$(printf '%s' "$PROJECTS" | jq 'length')"

if [ "$COUNT" -eq 0 ]; then
  echo "::error::Infisical OIDC login succeeded, but no accessible projects were returned for organization ${INFISICAL_ORG_ID}"
  exit 1
fi

if [ "$COUNT" -eq 1 ]; then
  SELECTED="$(printf '%s' "$PROJECTS" | jq -c '.[0]')"
else
  MATCHES="$(printf '%s' "$PROJECTS" | jq -c '[.[] | select((.name | ascii_downcase | gsub("[ _-]"; "")) == "ogenicsio")]')"
  MATCH_COUNT="$(printf '%s' "$MATCHES" | jq 'length')"
  if [ "$MATCH_COUNT" -ne 1 ]; then
    echo "Accessible Infisical projects in target organization:"
    printf '%s' "$PROJECTS" | jq -r '.[] | "- name=\(.name) slug=\(.slug) id=\(.id)"'
    echo "::error::Could not uniquely identify OGENIC-SIO project automatically"
    exit 1
  fi
  SELECTED="$(printf '%s' "$MATCHES" | jq -c '.[0]')"
fi

PROJECT_SLUG="$(printf '%s' "$SELECTED" | jq -r '.slug')"
PROJECT_ID="$(printf '%s' "$SELECTED" | jq -r '.id')"
PROJECT_NAME="$(printf '%s' "$SELECTED" | jq -r '.name')"

if [ -z "$PROJECT_SLUG" ] || [ "$PROJECT_SLUG" = "null" ]; then
  echo "::error::Resolved Infisical project has no slug"
  exit 1
fi

printf 'Resolved Infisical project: name=%s slug=%s id=%s\n' "$PROJECT_NAME" "$PROJECT_SLUG" "$PROJECT_ID"
echo "INFISICAL_PROJECT_SLUG=${PROJECT_SLUG}" >> "$GITHUB_ENV"
echo "INFISICAL_PROJECT_ID=${PROJECT_ID}" >> "$GITHUB_ENV"

# Cloudflare deploy credentials are account-scoped infrastructure credentials.
# Reuse one canonical Infisical copy instead of duplicating values per environment.
ENV_SLUGS="$(printf '%s' "$SELECTED" | jq -r '.environments[]?.slug')"
CANDIDATES='[]'

while IFS= read -r ENV_SLUG; do
  [ -n "$ENV_SLUG" ] || continue
  META="$(curl -sS --get \
    -H "Authorization: Bearer ${INFISICAL_TOKEN}" \
    --data-urlencode "projectId=${PROJECT_ID}" \
    --data-urlencode "environment=${ENV_SLUG}" \
    --data-urlencode "secretPath=/" \
    --data-urlencode "recursive=true" \
    --data-urlencode "viewSecretValue=false" \
    --data-urlencode "expandSecretReferences=false" \
    "${INFISICAL_API_URL}/api/v4/secrets")"

  PATHS="$(printf '%s' "$META" | jq -c '[.secrets[]? | select(.secretKey == "CLOUDFLARE_API_TOKEN" or .secretKey == "CLOUDFLARE_ACCOUNT_ID") | (.secretPath // "/")] | unique')"
  while IFS= read -r SECRET_PATH; do
    [ -n "$SECRET_PATH" ] || continue
    KEY_COUNT="$(printf '%s' "$META" | jq -r --arg P "$SECRET_PATH" '[.secrets[]? | select((.secretKey == "CLOUDFLARE_API_TOKEN" or .secretKey == "CLOUDFLARE_ACCOUNT_ID") and ((.secretPath // "/") == $P)) | .secretKey] | unique | length')"
    if [ "$KEY_COUNT" -eq 2 ]; then
      CANDIDATES="$(printf '%s' "$CANDIDATES" | jq -c --arg env "$ENV_SLUG" --arg path "$SECRET_PATH" '. + [{env:$env,path:$path}]')"
    fi
  done < <(printf '%s' "$PATHS" | jq -r '.[]')
done <<< "$ENV_SLUGS"

CANDIDATE_COUNT="$(printf '%s' "$CANDIDATES" | jq 'length')"
if [ "$CANDIDATE_COUNT" -eq 0 ]; then
  echo "::error::CONFIGURATION_REQUIRED: no Infisical location contains both CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID"
  exit 1
fi

PREFERRED="$(printf '%s' "$CANDIDATES" | jq -c --arg ENV "$PREFERRED_ENV" '[.[] | select(.env == $ENV)]')"
PREFERRED_COUNT="$(printf '%s' "$PREFERRED" | jq 'length')"

if [ "$PREFERRED_COUNT" -eq 1 ]; then
  SELECTED_SECRET_SOURCE="$(printf '%s' "$PREFERRED" | jq -c '.[0]')"
elif [ "$CANDIDATE_COUNT" -eq 1 ]; then
  SELECTED_SECRET_SOURCE="$(printf '%s' "$CANDIDATES" | jq -c '.[0]')"
else
  echo "Cloudflare deploy credentials exist in multiple Infisical locations:"
  printf '%s' "$CANDIDATES" | jq -r '.[] | "- env=\(.env) path=\(.path)"'
  echo "::error::CONFIGURATION_REQUIRED: choose one canonical Cloudflare secret source"
  exit 1
fi

SECRET_ENV_SLUG="$(printf '%s' "$SELECTED_SECRET_SOURCE" | jq -r '.env')"
SECRET_PATH="$(printf '%s' "$SELECTED_SECRET_SOURCE" | jq -r '.path')"

echo "Resolved canonical Infisical Cloudflare source: env=${SECRET_ENV_SLUG} path=${SECRET_PATH}"
echo "INFISICAL_SECRET_ENV_SLUG=${SECRET_ENV_SLUG}" >> "$GITHUB_ENV"
echo "INFISICAL_SECRET_PATH=${SECRET_PATH}" >> "$GITHUB_ENV"

if [ -n "${GITHUB_OUTPUT:-}" ]; then
  echo "project_slug=${PROJECT_SLUG}" >> "$GITHUB_OUTPUT"
  echo "project_id=${PROJECT_ID}" >> "$GITHUB_OUTPUT"
  echo "secret_env_slug=${SECRET_ENV_SLUG}" >> "$GITHUB_OUTPUT"
  echo "secret_path=${SECRET_PATH}" >> "$GITHUB_OUTPUT"
fi
