# Unifiend Copilot modes

Owner requested preparing supported modes before use. This kit is staged for the existing Ocian-S-Host and GH-ADDMINPOVIDER. It does not certify that the host has been changed, authenticated or run a model.

## What needs installation or configuration

| Capability | Preparation | Readiness boundary |
| --- | --- | --- |
| Terminal and one-shot prompt | One Copilot CLI package, Node 22 or later | Existing selected-user authentication, model entitlement and quota |
| ACP stdio | Same package; client spawns a child process | ACP client initialization and an authorized session |
| ACP TCP | Same package; listener on loopback by vendor default | Reach through an authenticated existing transport; no public listener configured |
| Full GitHub MCP catalog | `--enable-all-github-mcp-tools` at launch | Catalog visibility does not grant API permissions or tool approval |
| Additional MCP servers | Configure each supported server and its authentication | A ChatGPT connector is not automatically a host MCP configuration |
| Skills and instructions | Select reviewed sources and current Owner contract | Source presence is not a successful agent invocation |
| Hooks and custom agents | Supported definitions with existing checkpoint contract | The kit does not implement cross-chat resume or new hooks |
| LSP | Install only language servers required by actual repositories | Not needed for ACP transport initialization |
| REST API, SDK, NPX, NPM, webhooks and other existing connector modes | Reuse existing adapters; install the client dependency only when required | Each destination needs its own endpoint, credentials and smoke receipt |

GitHub repository Administration permission does not establish Copilot model entitlement. BYOK may run model requests without GitHub login, but GitHub MCP and code search still need GitHub authentication. Keep the existing DeepSeek route. No automatic paid fallback, model download, profile reset, new memory store or daemon is part of this kit.

## Existing service account usage

Use the same unprivileged account that owns the existing execution environment. Do not run installation under root and do not change Codex auth directories. Run these commands from the checked-out source directory at the verified staging commit:

```bash
python3 scripts/unifiend-copilot-modes.py inspect
python3 scripts/unifiend-copilot-modes.py install-missing
python3 scripts/unifiend-copilot-modes.py inspect
```

The installer preserves an existing CLI and auth. A missing CLI is pinned to the official prerelease `@github/copilot@1.0.106-2` in user-local storage for transport verification. Stable 1.0.105 did not pass the first transport probe. Global help does not necessarily list transport-specific flags; actual initialization is authoritative. If an existing version lacks requested flags, inspection reports unsupported; it does not overwrite the existing program automatically. Do not call either release host-ready until actual transport and authentication results are read.

After verifying the selected account, entitlement and task scope, start the chosen mode on demand:

```bash
python3 scripts/unifiend-copilot-modes.py launch --mode terminal --cwd /verified/worktree
python3 scripts/unifiend-copilot-modes.py launch --mode prompt --cwd /verified/worktree --prompt 'Review the requested task'
python3 scripts/unifiend-copilot-modes.py launch --mode acp-stdio --cwd /verified/worktree
python3 scripts/unifiend-copilot-modes.py launch --mode acp-tcp --cwd /verified/worktree --port 3000
```

These are alternatives, not four simultaneous processes. Native permission checks remain enabled; the kit never adds allow-all or disables sandboxing. The launcher forwards only supported Copilot authentication/provider variables, not every injected Infisical value. Do not configure credentials inside launch arguments or commit them to source.

`inspect` never verifies auth or credits and does not infer readiness from a badge. Transport smoke sends only ACP `initialize`, with built-in MCP disabled in an isolated temporary home, and sends no session/new or prompt. Startup uses a synthetic loopback provider that can return model metadata but rejects and counts inference requests. Zero inference requests are required. A successful handshake proves only ACP transport against this fixture, not provider authentication, model entitlement, tool invocation or a D1 checkout.

The Cloud capability workflow records Copilot package/transport outcome separately from host state and includes that outcome in the existing canonical checkpoint. Failed optional transport verification must remain visible even when the independent control/broker checkpoint succeeds.

## Current physical-host boundary

DigitalOcean API read on 1 November 2026 reports the existing host active, one vCPU and 1024 MiB memory. The Console page currently returns Site Unavailable in this browser. The previous direct SSH client-key unlock boundary remains unresolved. DigitalOcean's connected management plugin exposes no shell execution action. Do not interpret a source commit or Cloud package test as installation on Ocian-S-Host.

## Official references

- https://docs.github.com/en/copilot/reference/copilot-cli-reference/acp-server
- https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-command-reference
- https://docs.github.com/en/copilot/how-tos/copilot-cli/set-up-copilot-cli/install-copilot-cli
- https://docs.github.com/en/copilot/how-tos/copilot-cli/set-up-copilot-cli/authenticate-copilot-cli
- https://github.com/github/copilot-cli/releases/tag/v1.0.106-2

p-stack: 19 Build the lever, 34 Prove it works, 50 Unslop.
