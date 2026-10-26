#!/usr/bin/env bash
set -Eeuo pipefail

REPO="Wave-Runner-2/Build-Platform"
BRANCH="phase-vi-provider-incentive-metering"
RUNNER_NAME="wave-runner-01"
RUNNER_LABELS="wave,sgp1"
RUNNER_USER="wave"
RUNNER_HOME="/opt/wave"
RUNNER_DIR="${RUNNER_HOME}/actions-runner"

log() { printf '\n[WAVE] %s\n' "$*"; }
fail() { printf '\n[WAVE][BLOCKED] %s\n' "$*" >&2; exit 1; }

[[ "${EUID}" -eq 0 ]] || fail "Run this bootstrap as root."
command -v gh >/dev/null 2>&1 || fail "GitHub CLI (gh) is not installed."
command -v docker >/dev/null 2>&1 || fail "Docker is not installed."
command -v node >/dev/null 2>&1 || fail "Node.js is not installed."
command -v npm >/dev/null 2>&1 || fail "npm is not installed."
command -v wrangler >/dev/null 2>&1 || fail "Wrangler is not installed."

gh auth status >/dev/null 2>&1 || fail "GitHub CLI is not authenticated. Run: gh auth login"

log "Ensuring runner user and workspace"
if ! id -u "${RUNNER_USER}" >/dev/null 2>&1; then
  useradd --create-home --shell /bin/bash "${RUNNER_USER}"
fi
usermod -aG docker "${RUNNER_USER}" || true
mkdir -p "${RUNNER_DIR}"
chown -R "${RUNNER_USER}:${RUNNER_USER}" "${RUNNER_HOME}"

log "Resolving latest GitHub Actions runner"
RUNNER_VERSION="$(gh api repos/actions/runner/releases/latest --jq '.tag_name' | sed 's/^v//')"
[[ -n "${RUNNER_VERSION}" ]] || fail "Could not resolve runner version."
RUNNER_ARCHIVE="actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz"
RUNNER_URL="https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/${RUNNER_ARCHIVE}"

if [[ ! -x "${RUNNER_DIR}/config.sh" ]]; then
  log "Downloading Actions runner ${RUNNER_VERSION}"
  tmp_archive="$(mktemp)"
  curl -fL "${RUNNER_URL}" -o "${tmp_archive}"
  tar -xzf "${tmp_archive}" -C "${RUNNER_DIR}"
  rm -f "${tmp_archive}"
  chown -R "${RUNNER_USER}:${RUNNER_USER}" "${RUNNER_DIR}"
else
  log "Actions runner already present; keeping existing installation"
fi

log "Requesting one-time repository runner registration token"
RUNNER_TOKEN="$(gh api --method POST "repos/${REPO}/actions/runners/registration-token" --jq '.token')"
[[ -n "${RUNNER_TOKEN}" ]] || fail "Could not obtain runner registration token."

log "Configuring self-hosted runner"
if [[ -f "${RUNNER_DIR}/.runner" ]]; then
  log "Runner already configured; preserving current registration"
else
  runuser -u "${RUNNER_USER}" -- env HOME="/home/${RUNNER_USER}" \
    "${RUNNER_DIR}/config.sh" \
      --url "https://github.com/${REPO}" \
      --token "${RUNNER_TOKEN}" \
      --name "${RUNNER_NAME}" \
      --labels "${RUNNER_LABELS}" \
      --work "_work" \
      --unattended
fi
unset RUNNER_TOKEN

log "Installing runner as a system service"
cd "${RUNNER_DIR}"
./svc.sh install "${RUNNER_USER}" >/dev/null 2>&1 || true
./svc.sh start
./svc.sh status || true

log "Installing Codex CLI if missing"
if ! command -v codex >/dev/null 2>&1; then
  npm install -g @openai/codex
fi

log "Installing Cloudflare cf CLI open beta if missing"
if ! command -v cf >/dev/null 2>&1; then
  npm install -g cf
fi

log "Verifying execution node"
printf 'hostname: '; hostname
printf 'kernel: '; uname -r
printf 'git: '; git --version
printf 'gh: '; gh --version | head -n 1
printf 'node: '; node --version
printf 'npm: '; npm --version
printf 'docker: '; docker --version
printf 'wrangler: '; wrangler --version
printf 'cf: '; cf --version || true
printf 'codex: '; codex --version || true
printf '\nMemory / swap:\n'; free -h
printf '\nDisk:\n'; df -h /

log "Repository/branch contract"
echo "repo=${REPO}"
echo "branch=${BRANCH}"
echo "runner=${RUNNER_NAME}"
echo "labels=self-hosted,linux,x64,${RUNNER_LABELS}"

log "BOOTSTRAP COMPLETE"
echo "Next: let GitHub Actions pick up the WAVE self-hosted smoke job."
echo "Cloudflare cf CLI is installed alongside Wrangler; Wrangler remains the deploy fallback during cf open beta."
echo "Codex authentication is intentionally left as a separate owner-controlled step."
