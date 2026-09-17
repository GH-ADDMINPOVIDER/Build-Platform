#!/usr/bin/env bash
set -euo pipefail

SOURCE_SVG="${1:-public/ogenic-harness-app-icon.svg}"
ICONSET="$(find ios/App/App/Assets.xcassets -type d -name 'AppIcon.appiconset' -print -quit)"

if [[ ! -f "$SOURCE_SVG" ]]; then
  echo "::error::Missing native icon source: $SOURCE_SVG"
  exit 1
fi
if [[ -z "$ICONSET" || ! -d "$ICONSET" ]]; then
  echo "::error::Could not locate AppIcon.appiconset"
  exit 1
fi

PREVIEW_DIR="$(mktemp -d)"
trap 'rm -rf "$PREVIEW_DIR"' EXIT

# macOS Quick Look renders the repository SVG without adding network/toolchain dependencies.
qlmanage -t -s 1024 -o "$PREVIEW_DIR" "$SOURCE_SVG" >/dev/null 2>&1
SOURCE_PNG="$(find "$PREVIEW_DIR" -maxdepth 1 -type f -name '*.png' -print -quit)"
if [[ -z "$SOURCE_PNG" || ! -f "$SOURCE_PNG" ]]; then
  echo "::error::Could not render HARNESS SVG to PNG"
  exit 1
fi

CONTENTS="$ICONSET/Contents.json"
if [[ ! -f "$CONTENTS" ]]; then
  echo "::error::Missing AppIcon Contents.json"
  exit 1
fi

COUNT=0
while IFS=$'\t' read -r FILENAME SIZE SCALE; do
  [[ -n "$FILENAME" ]] || continue
  BASE="${SIZE%x*}"
  MULT="${SCALE%x}"
  PIXELS="$(python3 - <<PY
size=float("$BASE")
scale=float("$MULT")
print(int(round(size*scale)))
PY
)"
  [[ "$PIXELS" -gt 0 ]] || continue
  sips -z "$PIXELS" "$PIXELS" "$SOURCE_PNG" --out "$ICONSET/$FILENAME" >/dev/null
  COUNT=$((COUNT + 1))
done < <(jq -r '.images[]? | select(.filename != null) | [.filename, .size, (.scale // "1x")] | @tsv' "$CONTENTS")

# Capacitor 7 currently generates filename-backed AppIcon entries. Keep a safe fallback
# so a future template change still receives the branded 1024 source.
if [[ "$COUNT" -eq 0 ]]; then
  FALLBACK="$ICONSET/AppIcon-512@2x.png"
  sips -z 1024 1024 "$SOURCE_PNG" --out "$FALLBACK" >/dev/null
  python3 - "$CONTENTS" <<'PY'
import json, sys
path = sys.argv[1]
with open(path, encoding='utf-8') as f:
    data = json.load(f)
data['images'] = [{
    'filename': 'AppIcon-512@2x.png',
    'idiom': 'universal',
    'platform': 'ios',
    'size': '1024x1024'
}]
with open(path, 'w', encoding='utf-8') as f:
    json.dump(data, f, indent=2)
    f.write('\n')
PY
  COUNT=1
fi

echo "Applied OGENIC HARNESS native branding to ${COUNT} iOS app icon asset(s)."
