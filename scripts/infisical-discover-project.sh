#!/usr/bin/env bash
set -euo pipefail

: "${INFISICAL_IDENTITY_ID:?missing INFISICAL_IDENTITY_ID}"
: "${INFISICAL_ORG_ID:?missing INFISICAL_ORG_ID}"
: "${INFISICAL_ORG_SLUG:?missing INFISICAL_ORG_SLUG}"
: "${ACTIONS_ID_TOKEN_REQUEST_TOKEN:?missing GitHub OIDC request token}"
: "${ACTIONS_ID_TOKEN_REQUEST_URL:?missing GitHub OIDC request URL}"

INFISICAL_API_URL="${INFISICAL_API_URL:-https://app.infisical.com}"
TARGET_ENV="${INFISICAL_ENV_SLUG:-staging}"

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

# Discover the Cloudflare secret path without ever requesting secret values.
SECRETS_RESPONSE="$(curl -sS --get \
  -H "Authorization: Bearer ${INFISICAL_TOKEN}" \
  --data-urlencode "projectId=${PROJECT_ID}" \
  --data-urlencode "environment=${TARGET_ENV}" \
  --data-urlencode "secretPath=/" \
  --data-urlencode "recursive=true" \
  --data-urlencode "viewSecretValue=false" \
  --data-urlencode "expandSecretReferences=false" \
  "${INFISICAL_API_URL}/api/v4/secrets")"

CF_PATHS="$(printf '%s' "$SECRETS_RESPONSE" | jq -c '[.secrets[]? | select(.secretKey == "CLOUDFLARE_API_TOKEN" or .secretKey == "CLOUDFLARE_ACCOUNT_ID") | (.secretPath // "/")] | unique')"
CF_PATH_COUNT="$(printf '%s' "$CF_PATHS" | jq 'length')"

if [ "$CF_PATH_COUNT" -eq 1 ]; then
  SECRET_PATH="$(printf '%s' "$CF_PATHS" | jq -r '.[0]')"
  echo "Resolved Infisical Cloudflare secret path: ${SECRET_PATH}"
  echo "INFISICAL_SECRET_PATH=${SECRET_PATH}" >> "$GITHUB_ENV"
elif [ "$CF_PATH_COUNT" -gt 1 ]; then
  echo "Cloudflare secret keys were found in multiple staging paths:"
  printf '%s' "$CF_PATHS" | jq -r '.[] | "- " + .'
  echo "::error::CONFIGURATION_REQUIRED: Cloudflare deploy keys must resolve to one Infisical secret path"
  exit 1
else
  echo "No Cloudflare deploy keys were found in environment '${TARGET_ENV}'. Checking other project environments (metadata only)."
  ENV_SLUGS="$(printf '%s' "$SELECTED" | jq -r '.environments[]?.slug')"
  FOUND_ANY=0
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
    MATCHES="$(printf '%s' "$META" | jq -c '[.secrets[]? | select(.secretKey == "CLOUDFLARE_API_TOKEN" or .secretKey == "CLOUDFLARE_ACCOUNT_ID") | {key:.secretKey,path:(.secretPath // "/")}]')"
    N="$(printf '%s' "$MATCHES" | jq 'length')"
    if [ "$N" -gt 0 ]; then
      FOUND_ANY=1
      echo "Cloudflare key metadata found in environment '${ENV_SLUG}':"
      printf '%s' "$MATCHES" | jq -r '.[] | "- key=\(.key) path=\(.path)"'
    fi
  done <<< "$ENV_SLUGS"

  if [ "$FOUND_ANY" -eq 0 ]; then
    echo "::error::CONFIGURATION_REQUIRED: CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID are not present in Infisical project '${PROJECT_NAME}'"
  else
    echo "::error::CONFIGURATION_REQUIRED: Cloudflare deploy keys exist, but not in required '${TARGET_ENV}' environment"
  fi
  exit 1
fi

if [ -n "${GITHUB_OUTPUT:-}" ]; then
  echo "project_slug=${PROJECT_SLUG}" >> "$GITHUB_OUTPUT"
  echo "project_id=${PROJECT_ID}" >> "$GITHUB_OUTPUT"
  echo "secret_path=${SECRET_PATH}" >> "$GITHUB_OUTPUT"
fi
