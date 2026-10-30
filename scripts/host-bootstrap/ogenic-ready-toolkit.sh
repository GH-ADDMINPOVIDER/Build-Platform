#!/usr/bin/env bash
# OGENIC Unifiend — small verified developer tools, user-local only.
set -Eeuo pipefail
umask 077
[[ "$(id -un)" == "wave" ]] || { echo "REQUIRE_UNIFIEND_USER"; exit 76; }
[[ "$(uname -m)" == "x86_64" && "$(uname -s)" == "Linux" ]] || { echo "REQUIRE_LINUX_X64"; exit 76; }
mkdir -p "$HOME/.local/bin"
export PATH="$HOME/.local/bin:$PATH"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

fetch_verified() {
  local label="$1" url="$2" sha="$3" dest="$4"
  echo "DOWNLOADING_VERIFIED=$label"
  curl -fL --proto '=https' --tlsv1.2 --retry 2 --connect-timeout 15 --max-time 150 -o "$dest" "$url"
  printf '%s  %s\n' "$sha" "$dest" | sha256sum -c - >/dev/null
  echo "SHA256_VERIFIED=$label"
}
validate_tar_entries() {
  local name="$1" archive="$2"
  tar -tzf "$archive" > "$tmp/$name.entries"
  if grep -E '(^/|(^|/)\.\.(/|$))' "$tmp/$name.entries"; then
    echo "ARCHIVE_PATH_TRAVERSAL=$name"
    exit 70
  fi
}

if ! [[ -x "$HOME/.local/bin/rg" ]] || ! "$HOME/.local/bin/rg" --version | head -n1 | grep -q '15.2.0'; then
  fetch_verified rg \
    'https://github.com/BurntSushi/ripgrep/releases/download/15.2.0/ripgrep-15.2.0-x86_64-unknown-linux-musl.tar.gz' \
    '33e15bcf1624b25cdd2a55813a47a2f95dbe126268203e76aa6a585d1e7b149c' "$tmp/rg.tar.gz"
  validate_tar_entries rg "$tmp/rg.tar.gz"
  mkdir -p "$tmp/rg-unpack"
  tar --no-same-owner -xzf "$tmp/rg.tar.gz" -C "$tmp/rg-unpack"
  bin="$(find "$tmp/rg-unpack" -type f -name rg -print -quit)"
  test -n "$bin"
  install -m 0755 "$bin" "$HOME/.local/bin/rg"
fi
echo "RIPGREP_READY=$("$HOME/.local/bin/rg" --version | head -n 1)"

if ! [[ -x "$HOME/.local/bin/yq" ]] || ! "$HOME/.local/bin/yq" --version | grep -q 'v4.54.1'; then
  fetch_verified yq \
    'https://github.com/mikefarah/yq/releases/download/v4.54.1/yq_linux_amd64' \
    '8e34fc298390875de416e6a4afcb8cabeceb25d9aa8506c1a2f9353cf702ea5f' "$tmp/yq"
  install -m 0755 "$tmp/yq" "$HOME/.local/bin/yq"
fi
echo "YQ_READY=$("$HOME/.local/bin/yq" --version)"

if ! [[ -x "$HOME/.local/bin/uv" ]] || ! "$HOME/.local/bin/uv" --version | grep -q '0.13.0'; then
  fetch_verified uv \
    'https://github.com/astral-sh/uv/releases/download/0.13.0/uv-x86_64-unknown-linux-gnu.tar.gz' \
    '1468ebd5a5541121837c5a2817b9972ba6090fa6caa3d142620850a47fb75154' "$tmp/uv.tar.gz"
  validate_tar_entries uv "$tmp/uv.tar.gz"
  mkdir -p "$tmp/uv-unpack"
  tar --no-same-owner -xzf "$tmp/uv.tar.gz" -C "$tmp/uv-unpack"
  bin="$(find "$tmp/uv-unpack" -type f -name uv -print -quit)"
  binx="$(find "$tmp/uv-unpack" -type f -name uvx -print -quit)"
  test -n "$bin"
  test -n "$binx"
  install -m 0755 "$bin" "$HOME/.local/bin/uv"
  install -m 0755 "$binx" "$HOME/.local/bin/uvx"
fi
echo "UV_READY=$("$HOME/.local/bin/uv" --version)"
echo "UVX_READY=$("$HOME/.local/bin/uvx" --version)"
echo "RUNTIME_SERVICES_STARTED=NO"
echo "ROOT_ACCESS_USED=NO"
echo "SECRETS_ACCESSED=NO"
echo "OGENIC_USER_LOCAL_TOOLKIT_READY"
