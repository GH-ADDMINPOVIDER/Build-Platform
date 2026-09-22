#!/usr/bin/env bash
set -euo pipefail

STAGING_URL="${STAGING_URL:-https://ogenic-phase-vi-staging.tawatchaisamornrum11.workers.dev}"
: "${OGENIC_OPS_KEY:?OGENIC_OPS_KEY is required}"

COOKIE_JAR="$(mktemp)"
AGENT_ONE="$(mktemp)"
AGENT_TWO="$(mktemp)"
trap 'rm -f "$COOKIE_JAR" "$AGENT_ONE" "$AGENT_TWO"' EXIT

RUN_REF="${GITHUB_RUN_ID:-manual}-${GITHUB_RUN_ATTEMPT:-1}"
IDEM="phase-vi-final-agent-${RUN_REF}"
MARKER="OGENIC_AGENT_FINAL_RUNTIME_OK_${RUN_REF}"
PROMPT="Reply exactly: ${MARKER}"
APP_MARKER="[RUNTIME PROOF] OGENIC_APP_${RUN_REF}"

echo "== Phase VI final runtime proof =="
echo "staging=${STAGING_URL}"
echo "run_ref=${RUN_REF}"

HEALTH="$(curl --fail --silent --show-error --retry 4 --retry-delay 2 --retry-all-errors "${STAGING_URL}/api/health")"
printf '%s' "$HEALTH" | jq -e '.ok == true or .status == "ok" or .status == "healthy"' >/dev/null
printf '%s' "$HEALTH" | jq -c '{ok,status,git_sha:(.git_sha // (if (.runtime|type)=="object" then (.runtime.git_sha // .runtime.sha) else null end)),build_uuid:(.build_uuid // (if (.runtime|type)=="object" then .runtime.build_uuid else null end)),version_id:(.version_id // (if (.runtime|type)=="object" then (.runtime.version_id // .runtime.worker_version_id) else null end)),shared_state,ops_api_auth}'
echo

printf '{"owner_key":%s}' "$(jq -Rn --arg value "$OGENIC_OPS_KEY" '$value')"   | curl --fail --silent --show-error       --cookie-jar "$COOKIE_JAR"       --header 'Content-Type: application/json'       --data-binary @-       "${STAGING_URL}/api/session"   | jq -e '.ok == true and .authenticated == true and .user.role == "owner"' >/dev/null

SESSION="$(curl --fail --silent --show-error --cookie "$COOKIE_JAR" "${STAGING_URL}/api/session")"
printf '%s' "$SESSION" | jq -e '.authenticated == true and .user.role == "owner"' >/dev/null
echo "owner_session=PASS"

BEFORE_STATUS="$(curl --fail --silent --show-error --cookie "$COOKIE_JAR" "${STAGING_URL}/api/1lss/status")"
BEFORE_SEQ="$(printf '%s' "$BEFORE_STATUS" | jq -r '.latest_sequence // 0')"
echo "before_sequence=${BEFORE_SEQ}"

BEFORE_DASH="$(curl --fail --silent --show-error --cookie "$COOKIE_JAR" "${STAGING_URL}/api/dashboard")"
BEFORE_USED="$(printf '%s' "$BEFORE_DASH" | jq -r '[.incentives.pools[]? | select(.id=="standard") | .used][0] // 0')"
echo "standard_usage_before=${BEFORE_USED}"

PAYLOAD="$(jq -nc --arg prompt "$PROMPT" '{
  prompt:$prompt,
  model:"gpt-5.6-sol",
  source_surface:"ogenic-web",
  reasoning_effort:"low",
  allow_paid_fallback:false
}')"

call_agent() {
  local out="$1"
  local code
  code="$(curl --silent --show-error --output "$out" --write-out '%{http_code}'     --cookie "$COOKIE_JAR"     --header 'Content-Type: application/json'     --header "Idempotency-Key: ${IDEM}"     --data-binary "$PAYLOAD"     "${STAGING_URL}/api/chat/agent")"
  if [ "$code" -lt 200 ] || [ "$code" -ge 300 ]; then
    SAFE_CODE="$(jq -r '.code // "unknown"' "$out" 2>/dev/null || true)"
    SAFE_MESSAGE="$(jq -r '.message // ""' "$out" 2>/dev/null | head -c 300 || true)"
    echo "::error::Agent runtime failed: HTTP ${code}, code=${SAFE_CODE}, message=${SAFE_MESSAGE}"
    exit 1
  fi
}

call_agent "$AGENT_ONE"
jq -e --arg marker "$MARKER" '
  .ok == true and
  .runtime == "OPENAI_AGENT_SESSION" and
  .agent_terminal == "completed" and
  (.agent_session_id | type == "string" and length > 5) and
  .conversation_id == "owner-main" and
  .session_line == "1LSS_OWNER_MAIN" and
  .text == $marker
' "$AGENT_ONE" >/dev/null
SESSION_ID="$(jq -r '.agent_session_id' "$AGENT_ONE")"
USAGE_TOKENS="$(jq -r '.usage_tokens // 0' "$AGENT_ONE")"
echo "agent_runtime=OPENAI_AGENT_SESSION"
echo "agent_session_id_present=true"
echo "agent_usage_tokens=${USAGE_TOKENS}"

AFTER_ONE="$(curl --fail --silent --show-error --cookie "$COOKIE_JAR" "${STAGING_URL}/api/1lss/status")"
AFTER_ONE_SEQ="$(printf '%s' "$AFTER_ONE" | jq -r '.latest_sequence // 0')"
test "$AFTER_ONE_SEQ" -ge "$((BEFORE_SEQ + 2))" || {
  echo "::error::Canonical sequence did not advance by user+assistant turn"
  exit 1
}

HISTORY_ONE="$(curl --fail --silent --show-error --cookie "$COOKIE_JAR" "${STAGING_URL}/api/chat/history")"
printf '%s' "$HISTORY_ONE" | jq -e --arg marker "$MARKER" --arg prompt "$PROMPT" --arg sid "$SESSION_ID" '
  .conversation_id == "owner-main" and
  .session_line == "1LSS_OWNER_MAIN" and
  ([.messages[] | select(.role=="assistant" and .text==$marker and .source_surface=="ogenic-web" and .run_id==$sid)] | length) == 1 and
  ([.messages[] | select(.role=="user" and .text==$prompt and .source_surface=="ogenic-web" and .run_id==$sid)] | length) == 1
' >/dev/null
echo "canonical_agent_persistence=PASS"

call_agent "$AGENT_TWO"
jq -e '.ok == true and .runtime == "OPENAI_AGENT_SESSION"' "$AGENT_TWO" >/dev/null

AFTER_TWO="$(curl --fail --silent --show-error --cookie "$COOKIE_JAR" "${STAGING_URL}/api/1lss/status")"
AFTER_TWO_SEQ="$(printf '%s' "$AFTER_TWO" | jq -r '.latest_sequence // 0')"
test "$AFTER_TWO_SEQ" = "$AFTER_ONE_SEQ" || {
  echo "::error::Idempotency replay advanced canonical sequence: first=${AFTER_ONE_SEQ}, replay=${AFTER_TWO_SEQ}"
  exit 1
}

HISTORY_TWO="$(curl --fail --silent --show-error --cookie "$COOKIE_JAR" "${STAGING_URL}/api/chat/history")"
printf '%s' "$HISTORY_TWO" | jq -e --arg marker "$MARKER" --arg prompt "$PROMPT" '
  ([.messages[] | select(.role=="assistant" and .text==$marker and .source_surface=="ogenic-web")] | length) == 1 and
  ([.messages[] | select(.role=="user" and .text==$prompt and .source_surface=="ogenic-web")] | length) == 1
' >/dev/null
echo "idempotency_replay=PASS"

APP_EVENT="$(jq -nc --arg content "$APP_MARKER" '{
  source_surface:"ogenic-app",
  events:[{role:"system",content:$content,model:null}]
}')"
curl --fail --silent --show-error   --cookie "$COOKIE_JAR"   --header 'Content-Type: application/json'   --header "Idempotency-Key: phase-vi-final-app-${RUN_REF}"   --data-binary "$APP_EVENT"   "${STAGING_URL}/api/1lss/event"   | jq -e '.ok == true and .conversation_id == "owner-main" and .session_line == "1LSS_OWNER_MAIN"' >/dev/null

POST_APP_STATUS="$(curl --fail --silent --show-error --cookie "$COOKIE_JAR" "${STAGING_URL}/api/1lss/status")"
LATEST_SEQ="$(printf '%s' "$POST_APP_STATUS" | jq -r '.latest_sequence // 0')"

for surface in ogenic-web ogenic-app; do
  path="/chat"
  [ "$surface" = "ogenic-app" ] && path="/app"
  body="$(jq -nc     --arg surface "$surface"     --arg ref "automated-final-proof-${surface}-${RUN_REF}"     --arg url "${STAGING_URL}${path}"     --arg label "Automated final runtime proof"     --argjson seq "$LATEST_SEQ"     '{source_surface:$surface,session_ref:$ref,session_url:$url,label:$label,sequence_no:$seq}')"
  printf '%s' "$body"     | curl --fail --silent --show-error         --cookie "$COOKIE_JAR"         --header 'Content-Type: application/json'         --data-binary @-         "${STAGING_URL}/api/1lss/sessions"     | jq -e '.ok == true' >/dev/null
done

FINAL_STATUS="$(curl --fail --silent --show-error --cookie "$COOKIE_JAR" "${STAGING_URL}/api/1lss/status")"
printf '%s' "$FINAL_STATUS" | jq -e '
  .ok == true and
  .cross_surface_ready == true and
  ([.surfaces[] | select(.source_surface=="ogenic-web" and .fresh==true and .persisted==true and .caught_up_to_pair_latest==true)] | length) == 1 and
  ([.surfaces[] | select(.source_surface=="ogenic-app" and .fresh==true and .persisted==true and .caught_up_to_pair_latest==true)] | length) == 1
' >/dev/null
printf '%s' "$FINAL_STATUS" | jq -c '{latest_sequence,cross_surface_ready,surfaces}'
echo

curl --fail --silent --show-error --cookie "$COOKIE_JAR" "${STAGING_URL}/chat" >/dev/null
curl --fail --silent --show-error --cookie "$COOKIE_JAR" "${STAGING_URL}/app" >/dev/null
echo "chat_app_routes=PASS"

AFTER_DASH="$(curl --fail --silent --show-error --cookie "$COOKIE_JAR" "${STAGING_URL}/api/dashboard")"
AFTER_USED="$(printf '%s' "$AFTER_DASH" | jq -r '[.incentives.pools[]? | select(.id=="standard") | .used][0] // 0')"
TELEMETRY="$(printf '%s' "$AFTER_DASH" | jq -r '[.incentives.pools[]? | select(.id=="standard") | .telemetry][0] // "unknown"')"
test "$AFTER_USED" -ge "$BEFORE_USED" || {
  echo "::error::Usage meter decreased unexpectedly"
  exit 1
}
echo "standard_usage_after=${AFTER_USED}"
echo "usage_telemetry=${TELEMETRY}"

echo "RESULT=PASS"
echo "conversation_id=owner-main"
echo "session_line=1LSS_OWNER_MAIN"
echo "latest_sequence=${LATEST_SEQ}"
echo "cross_surface_ready=true"
