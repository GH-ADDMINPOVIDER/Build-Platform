#!/usr/bin/env bash
# OWNER-OPT-IN: one-time passphrase removal on the client holding the existing private key.
# No new keys, no copying secrets, no uploads, no server modification.
set -euo pipefail
umask 077
if [[ "$#" -ne 2 ]] || [[ "$1" != "--remove-passphrase" ]]; then
  printf 'Usage: bash %s --remove-passphrase /absolute/path/to/existing-private-key\n' "$0" >&2
  exit 2
fi
key="$2"
if [[ "$key" != /* || ! -f "$key" || -L "$key" ]]; then
  printf 'Existing regular absolute private key path required; symlinks rejected.\n' >&2
  exit 2
fi
if [[ ! -t 0 || ! -t 1 ]]; then
  printf 'Interactive local terminal required. Never send the passphrase through chat.\n' >&2
  exit 2
fi
if [[ "$(stat -c %u -- "$key")" != "$(id -u)" ]]; then
  printf 'The current SSH client user must own the existing private key.\n' >&2
  exit 2
fi
command -v ssh-keygen >/dev/null 2>&1 || exit 127
chmod 600 -- "$key"
if ssh-keygen -y -P '' -f "$key" >/dev/null 2>&1; then
  printf 'EXISTING_KEY_ALREADY_UNENCRYPTED; NO_CHANGE\n'
  exit 0
fi
printf 'ONE-TIME ACTION: removing the passphrase from the existing key.\n'
printf 'Enter the OLD passphrase only at the local ssh-keygen prompt.\n'
printf 'Security: the private key will no longer be encrypted at rest.\n'
ssh-keygen -p -f "$key" -N ''
chmod 600 -- "$key"
if ! ssh-keygen -y -P '' -f "$key" >/dev/null 2>&1; then
  printf 'KEY_CHANGE_NOT_VERIFIED; STOP\n' >&2
  exit 1
fi
printf 'EXISTING_PRIVATE_KEY_PASSPHRASE_REMOVED_AND_VERIFIED; SSH_LOGIN_NOT_TESTED\n'
