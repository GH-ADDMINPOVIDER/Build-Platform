#!/usr/bin/env bash
set -euo pipefail

# Staging-only TMN dependency repair. Never mounts the host Docker socket,
# SSH keys, Infisical secrets, home directory, or provider credentials.
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="$REPO_ROOT/apps/ogenic-control-tower"
test -f "$APP_DIR/package.json"
command -v docker >/dev/null

docker run --rm \
  --user "$(id -u):$(id -g)" \
  --cap-drop ALL --security-opt no-new-privileges \
  --memory 2g --cpus 2 --pids-limit 256 \
  --tmpfs /tmp:rw,nosuid,size=1024m \
  -e npm_config_cache=/tmp/npm-cache \
  --mount "type=bind,src=$APP_DIR,dst=/work" \
  -w /work node:22-alpine \
  sh -eu -c '
    npm install --package-lock-only --ignore-scripts --no-fund --no-audit
    npm ci --ignore-scripts --no-fund --no-audit
    npm test
    node -e '\''const p=require("./package-lock.json").packages;
      const sdk=p["node_modules/@modelcontextprotocol/sdk"].version.split(".").map(Number);
      const proxy=p["node_modules/proxy-addr"].version.split(".").map(Number);
      if (sdk[0]!==1 || sdk[1]<32 || proxy[0]!==2 || proxy[1]!==0 || proxy[2]<8)
        process.exit(1);
      console.log("Patched SDK", sdk.join("."), "proxy-addr", proxy.join("."));'\''
  '
