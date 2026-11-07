#!/usr/bin/env bash
# Registers this container as a self-hosted job machine for ONE repo, then waits for jobs.
# Needs Railway variables: GH_PAT (token that may manage this repo's job machines), GH_REPO (owner/name).
# Optional: AGENT_NAME, AGENT_LABELS (comma separated, default GH-ADDMINPOVIDER).
set -euo pipefail
: "${GH_PAT:?missing GH_PAT}"
: "${GH_REPO:?missing GH_REPO}"
NAME="${AGENT_NAME:-railway-$(hostname)}"
LABELS="${AGENT_LABELS:-GH-ADDMINPOVIDER}"
API="https://api.github.com/repos/${GH_REPO}/actions/runners"
H=(-H "Authorization: Bearer ${GH_PAT}" -H "Accept: application/vnd.github+json" -H "X-GitHub-Api-Version: 2022-11-28")

reg_token() { curl -fsS -X POST "${H[@]}" "${API}/registration-token" | jq -r .token; }
rem_token() { curl -fsS -X POST "${H[@]}" "${API}/remove-token" | jq -r .token; }

cd /opt/agent
./config.sh --unattended --url "https://github.com/${GH_REPO}" --token "$(reg_token)" \
  --name "${NAME}" --labels "${LABELS}" --replace --disableupdate
echo "registered as ${NAME} with labels ${LABELS}"

cleanup() { echo "stopping, removing registration"; ./config.sh remove --token "$(rem_token)" || true; }
trap 'cleanup; exit 0' SIGTERM SIGINT
./run.sh & wait $!
