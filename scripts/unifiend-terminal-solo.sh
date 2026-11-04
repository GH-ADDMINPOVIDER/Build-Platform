#!/usr/bin/env bash
# Unifiend TERMINAL SOLO execution boundary.
# SSH, IDEs and OPC share this special terminal environment (NOT Blue/Violet Agent Registry).
# This wrapper currently authorizes only the existing Yellow-gated Codex consumer.
# Future IDE/OPC adapters must use this SAME lock and owner approval contract.
set -euo pipefail
umask 077

if [[ "${RUNNER_NAME:-}" != "GH-ADDMINPOVIDER" ]]; then
  echo "TERMINAL_SOLO_DENIED_HOST" >&2; exit 78
fi
if [[ "${GITHUB_REF_NAME:-}" != "Unified-on-Progress" ]]; then
  echo "TERMINAL_SOLO_DENIED_ENVIRONMENT" >&2; exit 78
fi
if [[ "${GITHUB_REPOSITORY_ID:-}" != "1429580446" || "${GITHUB_REPOSITORY_OWNER_ID:-}" != "342175560" ]]; then
  echo "TERMINAL_SOLO_DENIED_REPOSITORY" >&2; exit 78
fi
if [[ ! "${UNIFIEND_TASK_ID:-}" =~ ^wavecmd_[a-f0-9]{64}$ ]]; then
  echo "TERMINAL_SOLO_DENIED_TASK_ID" >&2; exit 78
fi
if ! command -v flock >/dev/null 2>&1; then
  echo "TERMINAL_SOLO_FLOCK_UNAVAILABLE" >&2; exit 78
fi
if ! command -v node >/dev/null 2>&1; then
  echo "TERMINAL_SOLO_NODE_UNAVAILABLE" >&2; exit 78
fi

# Single, stable lock shared by all Terminal adapters of this runner user.
# A per-job temp lock or GitHub concurrency group alone cannot enforce SOLO.
lock="${HOME:?}/.ogenic-unifiend-terminal-solo.lock"
exec 9>"$lock"
chmod 600 "$lock"
if ! flock -w 900 9; then
  echo "TERMINAL_SOLO_BUSY_TIMEOUT" >&2; exit 75
fi
echo "TERMINAL_SOLO_LOCK=ACQUIRED"
echo "TERMINAL_SOLO_EXECUTOR=CODEX_YELLOW_GATED"
echo "TERMINAL_SOLO_OTHER_EXECUTORS=NOT_YET_CONNECTED"
# Bash keeps fd 9 locked until this child completes.
node scripts/unifiend-command-consumer.mjs
