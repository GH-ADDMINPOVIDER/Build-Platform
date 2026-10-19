#!/usr/bin/env bash
# Metadata-only selection; never handle secret values.
set -euo pipefail
select_cloudflare_source() {
  local candidates="$1" target_env="$2" target_path="$3" matches count
  if ! printf '%s' "$candidates" | jq -e 'type == "array" and all(.[]; (.env|type) == "string" and (.path|type) == "string")' >/dev/null; then
    echo "::error::CONFIGURATION_REQUIRED: invalid sanitized Infisical source metadata" >&2
    return 1
  fi
  matches="$(printf '%s' "$candidates" | jq -c --arg e "$target_env" --arg p "$target_path" '[.[] | select(.env == $e and .path == $p)]')"
  count="$(printf '%s' "$matches" | jq 'length')"
  if [ "$count" -eq 0 ]; then
    echo "::error::CONFIGURATION_REQUIRED: missing Cloudflare pair at env=$target_env path=$target_path; no dev fallback" >&2
    return 1
  elif [ "$count" -ne 1 ]; then
    echo "::error::CONFIGURATION_REQUIRED: duplicate Cloudflare pair at env=$target_env path=$target_path" >&2
    return 1
  fi
  printf '%s' "$matches" | jq -c '.[0]'
}
if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  [ "$#" -eq 3 ] || { echo "Usage: $0 <candidates> <environment> <path>" >&2; exit 2; }
  select_cloudflare_source "$1" "$2" "$3"
fi
