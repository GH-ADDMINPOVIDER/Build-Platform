#!/usr/bin/env bash
# Run in the existing Owner Console. Read only; emit status and public binding metadata.
for profile in /root/.codex /home/*/.codex; do
  [ -d "$profile" ] || continue
  account=$(stat -c %U "$profile")
  printf '\nACCOUNT=%s\n' "$account"
  sudo -H -u "$account" /bin/bash -s <<'UNIFIEND_STATUS'
set +x
cd "$HOME" || exit 1
export PATH="$HOME/.local/bin:$HOME/.npm-global/bin:$PATH"
for tool in codex infisical; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    printf '%s=NOT_IN_PATH\n' "$tool"
  elif status=$(timeout 10s "$tool" login status 2>&1); then
    printf '%s=LOGIN_OK\n' "$tool"
    case "$status" in
      *ChatGPT*) printf 'AUTH_MODE=CHATGPT\n' ;;
      *'API key'*) printf 'AUTH_MODE=API_KEY\n' ;;
    esac
  else
    printf '%s=LOGIN_NOT_VERIFIED\n' "$tool"
  fi
done
UNIFIEND_STATUS
done
python3 - <<'UNIFIEND_BINDING'
import json, pathlib, subprocess, urllib.parse
units = subprocess.check_output(['systemctl','list-units','--all','--type=service','--no-legend','--plain','--no-pager','actions.*'], text=True)
for line in units.splitlines():
    unit = line.split()[0]
    raw = subprocess.check_output(['systemctl','show',unit,'-p','WorkingDirectory','-p','ActiveState','-p','User','--no-pager'], text=True)
    fields = dict(part.split('=',1) for part in raw.splitlines() if '=' in part)
    result = {'service_state':fields.get('ActiveState'), 'service_user':fields.get('User') or 'root'}
    directory = pathlib.Path(fields.get('WorkingDirectory') or '/')
    try:
        config = json.loads((directory / '.runner').read_text())
        url = urllib.parse.urlsplit(str(config.get('gitHubUrl') or ''))
        result['repository_binding'] = 'https://github.com' + url.path if url.scheme == 'https' and url.netloc == 'github.com' and not url.query and not url.fragment else 'UNVERIFIED'
        result['registration_id'] = config.get('agentId') if isinstance(config.get('agentId'), int) else None
    except (OSError, ValueError):
        result['repository_binding'] = 'CONFIG_NOT_RESOLVED'
    print(json.dumps(result))
UNIFIEND_BINDING
