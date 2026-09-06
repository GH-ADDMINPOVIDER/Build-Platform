#!/usr/bin/env bash
set -euo pipefail

: "${INFISICAL_IDENTITY_ID:?missing INFISICAL_IDENTITY_ID}"
: "${INFISICAL_ORG_ID:?missing INFISICAL_ORG_ID}"
: "${INFISICAL_ORG_SLUG:?missing INFISICAL_ORG_SLUG}"
: "${ACTIONS_ID_TOKEN_REQUEST_TOKEN:?missing GitHub OIDC request token}"
: "${ACTIONS_ID_TOKEN_REQUEST_URL:?missing GitHub OIDC request URL}"

INFISICAL_API_URL="${INFISICAL_API_URL:-https://app.infisical.com}"

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
  PROJECT_SLUG="$(printf '%s' "$PROJECTS" | jq -r '.[0].slug')"
  PROJECT_ID="$(printf '%s' "$PROJECTS" | jq -r '.[0].id')"
  PROJECT_NAME="$(printf '%s' "$PROJECTS" | jq -r '.[0].name')"
else
  MATCHES="$(printf '%s' "$PROJECTS" | jq -c '[.[] | select((.name | ascii_downcase | gsub("[ _-]"; "")) == "ogenicsio")]')"
  MATCH_COUNT="$(printf '%s' "$MATCHES" | jq 'length')"
  if [ "$MATCH_COUNT" -ne 1 ]; then
    echo "Accessible Infisical projects in target organization:"
    printf '%s' "$PROJECTS" | jq -r '.[] | "- name=\(.name) slug=\(.slug) id=\(.id)"'
    echo "::error::Could not uniquely identify OGENIC-SIO project automatically"
    exit 1
  fi
  PROJECT_SLUG="$(printf '%s' "$MATCHES" | jq -r '.[0].slug')"
  PROJECT_ID="$(printf '%s' "$MATCHES" | jq -r '.[0].id')"
  PROJECT_NAME="$(printf '%s' "$MATCHES" | jq -r '.[0].name')"
fi

if [ -z "$PROJECT_SLUG" ] || [ "$PROJECT_SLUG" = "null" ]; then
  echo "::error::Resolved Infisical project has no slug"
  exit 1
fi

printf 'Resolved Infisical project: name=%s slug=%s id=%s\n' "$PROJECT_NAME" "$PROJECT_SLUG" "$PROJECT_ID"
echo "INFISICAL_PROJECT_SLUG=${PROJECT_SLUG}" >> "$GITHUB_ENV"
echo "INFISICAL_PROJECT_ID=${PROJECT_ID}" >> "$GITHUB_ENV"

if [ -n "${GITHUB_OUTPUT:-}" ]; then
  echo "project_slug=${PROJECT_SLUG}" >> "$GITHUB_OUTPUT"
  echo "project_id=${PROJECT_ID}" >> "$GITHUB_OUTPUT"
fi
