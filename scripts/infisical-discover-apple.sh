#!/usr/bin/env bash
set -euo pipefail

: "${INFISICAL_IDENTITY_ID:?missing INFISICAL_IDENTITY_ID}"
: "${INFISICAL_ORG_SLUG:?missing INFISICAL_ORG_SLUG}"
: "${INFISICAL_PROJECT_ID:?missing INFISICAL_PROJECT_ID}"
: "${ACTIONS_ID_TOKEN_REQUEST_TOKEN:?missing GitHub OIDC request token}"
: "${ACTIONS_ID_TOKEN_REQUEST_URL:?missing GitHub OIDC request URL}"

INFISICAL_API_URL="${INFISICAL_API_URL:-https://app.infisical.com}"
PREFERRED_ENV="${INFISICAL_ENV_SLUG:-staging}"
REQUIRED_KEYS='["APPLE_TEAM_ID","APPSTORE_CONNECT_KEY_ID","APPSTORE_CONNECT_ISSUER_ID","APPSTORE_CONNECT_PRIVATE_KEY"]'

OIDC_RESPONSE="$(curl -sS -H "Authorization: Bearer ${ACTIONS_ID_TOKEN_REQUEST_TOKEN}" "${ACTIONS_ID_TOKEN_REQUEST_URL}")"
OIDC_JWT="$(printf '%s' "$OIDC_RESPONSE" | jq -r '.value // empty')"
[ -n "$OIDC_JWT" ] || { echo "::error::Could not obtain GitHub OIDC JWT"; exit 1; }

LOGIN_PAYLOAD="$(jq -n --arg identityId "$INFISICAL_IDENTITY_ID" --arg jwt "$OIDC_JWT" --arg organizationSlug "$INFISICAL_ORG_SLUG" '{identityId:$identityId,jwt:$jwt,organizationSlug:$organizationSlug}')"
LOGIN_RESPONSE="$(curl -sS -X POST -H 'Content-Type: application/json' --data "$LOGIN_PAYLOAD" "${INFISICAL_API_URL}/api/v1/auth/oidc-auth/login")"
INFISICAL_TOKEN="$(printf '%s' "$LOGIN_RESPONSE" | jq -r '.accessToken // empty')"
[ -n "$INFISICAL_TOKEN" ] || { echo "::error::Infisical OIDC login failed"; exit 1; }
echo "::add-mask::${INFISICAL_TOKEN}"

PROJECTS_RESPONSE="$(curl -sS -H "Authorization: Bearer ${INFISICAL_TOKEN}" "${INFISICAL_API_URL}/api/v1/projects")"
ENV_SLUGS="$(printf '%s' "$PROJECTS_RESPONSE" | jq -r --arg ID "$INFISICAL_PROJECT_ID" '.projects[]? | select(.id == $ID) | .environments[]?.slug')"
[ -n "$ENV_SLUGS" ] || { echo "::error::Could not resolve Infisical environments for Apple signing discovery"; exit 1; }

CANDIDATES='[]'
FOUND='[]'
while IFS= read -r ENV_SLUG; do
  [ -n "$ENV_SLUG" ] || continue
  META="$(curl -sS --get -H "Authorization: Bearer ${INFISICAL_TOKEN}" \
    --data-urlencode "projectId=${INFISICAL_PROJECT_ID}" \
    --data-urlencode "environment=${ENV_SLUG}" \
    --data-urlencode "secretPath=/" \
    --data-urlencode "recursive=true" \
    --data-urlencode "viewSecretValue=false" \
    --data-urlencode "expandSecretReferences=false" \
    "${INFISICAL_API_URL}/api/v4/secrets")"

  MATCHES="$(printf '%s' "$META" | jq -c --argjson keys "$REQUIRED_KEYS" '[.secrets[]? | select(.secretKey as $k | $keys | index($k)) | {key:.secretKey,path:(.secretPath // "/")}]')"
  FOUND="$(jq -cn --argjson a "$FOUND" --argjson b "$MATCHES" --arg env "$ENV_SLUG" '$a + [$b[] | . + {env:$env}]')"
  PATHS="$(printf '%s' "$MATCHES" | jq -r '.[].path' | sort -u)"
  while IFS= read -r SECRET_PATH; do
    [ -n "$SECRET_PATH" ] || continue
    COUNT="$(printf '%s' "$MATCHES" | jq -r --arg P "$SECRET_PATH" '[.[] | select(.path == $P) | .key] | unique | length')"
    if [ "$COUNT" -eq 4 ]; then
      CANDIDATES="$(printf '%s' "$CANDIDATES" | jq -c --arg env "$ENV_SLUG" --arg path "$SECRET_PATH" '. + [{env:$env,path:$path}]')"
    fi
  done <<< "$PATHS"
done <<< "$ENV_SLUGS"

COUNT="$(printf '%s' "$CANDIDATES" | jq 'length')"
if [ "$COUNT" -eq 0 ]; then
  echo "Apple signing metadata found (names only; values never printed):"
  printf '%s' "$FOUND" | jq -r 'group_by(.env + "|" + .path)[] | "- env=\(.[0].env) path=\(.[0].path) keys=\([.[].key] | unique | join(","))"' || true
  echo "::error::APPLE_SIGNING_CONFIG_MISSING: no single Infisical env/path contains all four required Apple signing keys"
  exit 1
fi

PREFERRED="$(printf '%s' "$CANDIDATES" | jq -c --arg ENV "$PREFERRED_ENV" '[.[] | select(.env == $ENV)]')"
PREFERRED_COUNT="$(printf '%s' "$PREFERRED" | jq 'length')"
if [ "$PREFERRED_COUNT" -eq 1 ]; then
  SELECTED="$(printf '%s' "$PREFERRED" | jq -c '.[0]')"
elif [ "$COUNT" -eq 1 ]; then
  SELECTED="$(printf '%s' "$CANDIDATES" | jq -c '.[0]')"
else
  echo "Apple signing credentials exist in multiple Infisical locations:"
  printf '%s' "$CANDIDATES" | jq -r '.[] | "- env=\(.env) path=\(.path)"'
  echo "::error::APPLE_SIGNING_CONFIG_AMBIGUOUS: choose one canonical source"
  exit 1
fi

APPLE_ENV_SLUG="$(printf '%s' "$SELECTED" | jq -r '.env')"
APPLE_SECRET_PATH="$(printf '%s' "$SELECTED" | jq -r '.path')"
echo "Resolved Apple signing source: env=${APPLE_ENV_SLUG} path=${APPLE_SECRET_PATH}"
echo "apple_env_slug=${APPLE_ENV_SLUG}" >> "$GITHUB_OUTPUT"
echo "apple_secret_path=${APPLE_SECRET_PATH}" >> "$GITHUB_OUTPUT"
