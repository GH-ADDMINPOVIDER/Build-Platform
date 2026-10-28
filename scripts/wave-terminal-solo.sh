#!/usr/bin/env bash
# GH-ADDMINPROVIDER Terminal Solo execution boundary.
# SSH, IDEs and OPC share this special terminal environment (NOT Blue/Violet Agent Registry).
# This wrapper currently authorizes only the existing Yellow-gated Codex consumer.
# Future IDE/OPC adapters must use this SAME lock and owner approval contract.
set -euo pipefail
umask 077

for required in GH_ADDMINPROVIDER_HOST GH_ADDMINPROVIDER_STAGING_REF GH_ADDMINPROVIDER_REPOSITORY; do
  if [[ -z "${!required:-}" ]]; then
    echo "TERMINAL_SOLO_CONFIGURATION_REQUIRED:$required" >&2; exit 78
  fi
done
if [[ "${RUNNER_NAME:-}" != "${GH_ADDMINPROVIDER_HOST}" ]]; then
  echo "TERMINAL_SOLO_DENIED_HOST" >&2; exit 78
fi
if [[ "${GITHUB_REF_NAME:-}" != "${GH_ADDMINPROVIDER_STAGING_REF}" ]]; then
  echo "TERMINAL_SOLO_DENIED_ENVIRONMENT" >&2; exit 78
fi
if [[ "${GITHUB_REPOSITORY:-}" != "${GH_ADDMINPROVIDER_REPOSITORY}" ]]; then
  echo "TERMINAL_SOLO_DENIED_REPOSITORY" >&2; exit 78
fi
if [[ ! "${WAVE_TASK_ID:-}" =~ ^wavecmd_[a-f0-9]{64}$ ]]; then
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
lock="${HOME:?}/.ogenic-wave-terminal-solo.lock"
exec 9>"$lock"
chmod 600 "$lock"
if ! flock -w 900 9; then
  echo "TERMINAL_SOLO_BUSY_TIMEOUT" >&2; exit 75
fi
echo "TERMINAL_SOLO_LOCK=ACQUIRED"
echo "TERMINAL_SOLO_EXECUTOR=CODEX_YELLOW_GATED"
echo "TERMINAL_SOLO_OTHER_EXECUTORS=NOT_YET_CONNECTED"
# Bash keeps fd 9 locked until this child completes.
node scripts/wave-command-consumer.mjs
