#!/usr/bin/env bash
# OCIAN-S HOST: owner-gated GH2 registration, staging only.
# This script is invoked via PINNED SSH by GH_ADDMIN_POVIDER GH2. Never run against GH1.
set -Eeuo pipefail
umask 077
unset BASH_XTRACEFD
set +x
TARGET="Wave-Runner-2/Build-Platform"
TARGET_RUNNER="GH_ADDMIN_POVIDER"
TARGET_PATH="/opt/wave/gh2-actions-runner"
SRC_GH1="/opt/wave/actions-runner"
FAIL() { printf 'GH2_ATTACH_BLOCKED=%s\n' "$1" >&2; exit 52; }
[[ "${EUID}" -ne 0 ]] || FAIL "NO_ROOT_INTERACTIVE_EXECUTOR"
[[ "$(id -un)" == "wave" ]] || FAIL "EXPECTED_WAVE_USER"
[[ "$1" == "Wave-Runner-2/Build-Platform" ]] || FAIL "TARGET_REPOSITORY_MISMATCH"
[[ "$2" == "feat/ccs-multi-protocol-docker-20261023" ]] || FAIL "STAGING_BRANCH_MISMATCH"
[[ "$(hostname)" == "wave-runner-01" || "$(hostname)" == "OCIAN-S-Host" || "$(hostname)" == "OCIAN-S-HOST" ]] || FAIL "UNEXPECTED_OCIAN_HOSTNAME"
[[ -d /opt/wave ]] || FAIL "ORIGINAL_WAVE_HOME_ABSENT"
[[ -e "${SRC_GH1}/.runner" ]] || FAIL "ORIGINAL_GH1_RUNNER_CONFIG_UNVERIFIED"
[[ ! -e "${TARGET_PATH}/.runner" ]] || FAIL "GH2_RUNNER_ALREADY_CONFIGURED_USE_VERIFICATION"
command -v python3 >/dev/null || FAIL "PYTHON3_MISSING"
command -v curl >/dev/null || FAIL "CURL_MISSING"
command -v tar >/dev/null || FAIL "TAR_MISSING"
command -v sha256sum >/dev/null || FAIL "SHA256SUM_MISSING"
# Registration token is delivered by GH2 via SSH stdin, not shell arguments, git, or logs.
IFS= read -r REGISTRATION_TOKEN || FAIL "REGISTRATION_TOKEN_STDIN_MISSING"
[[ "${#REGISTRATION_TOKEN}" -ge 20 ]] || FAIL "INVALID_REGISTRATION_TOKEN"
SERVICE_MODE="NONE"
if sudo -n true </dev/null >/dev/null 2>&1; then
  SERVICE_MODE="OWNER_APPROVED_SUDO"
else
  if command -v loginctl >/dev/null 2>&1 && [[ "$(loginctl show-user wave -p Linger --value 2>/dev/null)" == "yes" ]] && command -v systemctl >/dev/null 2>&1; then
    SERVICE_MODE="EXISTING_USER_LINGER"
  else
    FAIL "NO_EXISTING_SUDO_OR_USER_LINGER_SERVICE_PERMISSION"
  fi
fi
if [[ ! -e "${TARGET_PATH}/config.sh" ]]; then
  mkdir -p "${TARGET_PATH}"
  tmp="$(mktemp -d)"
  trap 'rm -rf "${tmp}"' EXIT
  curl -fsS --retry 2 --max-time 30 -H 'Accept: application/vnd.github+json' \
    'https://api.github.com/repos/actions/runner/releases/latest' > "${tmp}/release.json"
  python3 - "${tmp}/release.json" > "${tmp}/selection" <<'PY'
import json,sys,re
j=json.load(open(sys.argv[1],encoding='utf8'))
tag=j.get('tag_name','')
assets=[a for a in j.get('assets',[]) if re.match(r'actions-runner-linux-x64-[\d.]+\.tar\.gz$',a.get('name',''))]
if len(assets)!=1 or not re.fullmatch(r'v\d+\.\d+\.\d+',tag): sys.exit('UNVERIFIED_OFFICIAL_RUNNER_RELEASE')
a=assets[0]; h=a.get('digest','')
if not re.fullmatch(r'sha256:[0-9a-f]{64}',h): sys.exit('OFFICIAL_RUNNER_SHA256_NOT_PUBLISHED')
print(a['browser_download_url'])
print(h.split(':')[1])
PY
  mapfile -t selection < "${tmp}/selection"
  [[ "${selection[0]}" == https://github.com/actions/runner/releases/download/* ]] || FAIL "WRONG_DOWNLOAD_ORIGIN"
  curl -fL --retry 2 --max-time 120 "${selection[0]}" -o "${tmp}/runner.tar.gz"
  printf '%s  %s\n' "${selection[1]}" "${tmp}/runner.tar.gz" | sha256sum -c - >/dev/null || FAIL "RUNNER_SHA256_MISMATCH"
  tar -xzf "${tmp}/runner.tar.gz" -C "${TARGET_PATH}"
fi
[[ -x "${TARGET_PATH}/config.sh" ]] || FAIL "GH2_CONFIG_TOOL_MISSING"
cd "${TARGET_PATH}"
./config.sh --unattended --url "https://github.com/${TARGET}" \
    --token "${REGISTRATION_TOKEN}" --name "${TARGET_RUNNER}" \
    --labels "GH_ADDMIN_POVIDER,tmn,sgp1" --work "_work"
unset REGISTRATION_TOKEN
[[ -e "${TARGET_PATH}/.runner" ]] || FAIL "GH2_RUNNER_CONFIG_NOT_WRITTEN"
if [[ "${SERVICE_MODE}" == "OWNER_APPROVED_SUDO" ]]; then
  sudo -n ./svc.sh install wave >/dev/null || FAIL "GH2_SVC_INSTALL_FAILED"
  sudo -n ./svc.sh start >/dev/null || FAIL "GH2_SVC_START_FAILED"
  sudo -n ./svc.sh status || FAIL "GH2_SVC_NOT_RUNNING"
else
  # No privilege elevation. Only use existing authorized wave user lingering.
  mkdir -p "$HOME/.config/systemd/user"
  cat > "$HOME/.config/systemd/user/wave-gh2-provider.service" <<EOF
[Unit]
Description=WAVE GH_ADDMIN_POVIDER actions runner (staging)
After=network-online.target
[Service]
Type=simple
WorkingDirectory=${TARGET_PATH}
ExecStart=${TARGET_PATH}/run.sh
Restart=always
RestartSec=10
[Install]
WantedBy=default.target
EOF
  export XDG_RUNTIME_DIR="/run/user/$(id -u)"
  export DBUS_SESSION_BUS_ADDRESS="unix:path=${XDG_RUNTIME_DIR}/bus"
  systemctl --user daemon-reload || FAIL "USER_SYSTEMD_BUS_NOT_AVAILABLE"
  systemctl --user enable --now wave-gh2-provider.service || FAIL "GH2_USER_SVC_START_FAILED"
  systemctl --user is-active --quiet wave-gh2-provider.service || FAIL "GH2_USER_SVC_NOT_RUNNING"
fi
echo "GH2_RUNNER_SERVICE_MODE=${SERVICE_MODE}"
printf 'GH2_OCIAN_RUNNER_REGISTERED=YES\nGH2_OCIAN_RUNNER_NAME=%s\nGH1_ARCHIVE_RUNNER_TOUCHED=NO\n' "${TARGET_RUNNER}"
