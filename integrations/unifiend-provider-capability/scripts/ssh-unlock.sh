#!/usr/bin/env bash
# Source in the connecting client's interactive shell. Never pass a passphrase.
if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  printf 'Use: source %s /absolute/path/to/existing-key [1h]\n' "$0" >&2
  exit 2
fi
unifiend_unlock_existing_key() {
  local key="${1:-}" lifetime="${2:-1h}" status
  [[ "$key" == /* && -f "$key" && "$lifetime" =~ ^[1-9][0-9]*[smhd]?$ ]] || {
    printf 'Existing absolute key path and valid lifetime required.\n' >&2; return 2;
  }
  [[ -t 0 ]] || { printf 'Interactive terminal required.\n' >&2; return 2; }
  command -v ssh-agent >/dev/null && command -v ssh-add >/dev/null || return 127
  if ssh-add -l >/dev/null 2>&1; then status=0; else status=$?; fi
  if [[ "$status" == 2 ]]; then eval "$(ssh-agent -s)" >/dev/null || return; fi
  ssh-add -t "$lifetime" "$key" || return
  printf 'KEY_LOADED_IN_THIS_AGENT; DISK_PASSPHRASE_UNCHANGED; SSH_LOGIN_NOT_TESTED\n'
}
unifiend_unlock_existing_key "$@"
