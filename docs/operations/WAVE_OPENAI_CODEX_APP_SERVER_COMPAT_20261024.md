# WAVE / OGENIC — OpenAI Codex App Server Compatibility Audit (2026-10-24)

**Owner scope:** Existing seven WAVE E2E workstreams only. This record does **not** add an eighth workstream, restart OCIAN, change owner authority, launch a paid OpenAI API call, or alter historical GREEN/ORANGE checkpoints.

## Canonical OpenAI references checked

- [Codex App Server](https://learn.chatgpt.com/docs/app-server) — JSON-RPC, stdio/JSONL, client identity, approvals, thread & turn streaming, signed-in account auth, runtime schema generation.
- [Codex SDK](https://learn.chatgpt.com/docs/codex-sdk) — OpenAI recommends this for CI and automated jobs. A rich interactive client should use App Server.
- [Codex CLI release 0.164.0](https://github.com/openai/codex/releases/tag/rust-v0.164.0) — pinned version used in verified GitHub-hosted test.

## Execution placement, without architectural redesign

```text
Owner Native Sign / GS–GT Agent Native Sign
         ↓ ATHENA / Yellowstone: owner-scoped preflight, no bypass
GH_ADDMIN_POVIDER GH2 → Infisical OIDC (staging scoped secret broker)
         ↓
OCIAN-S HOST / INTERNAL / SUDO TERMINAL MODE
 SSH • IDEs • OPC • LCI • Codex GS • Copilot CLI TMN • OpenCode
         ↓
 Codex App Server local stdio JSONL ⇄ pinned TMN gateway / optional Unix socket
         ↓  requires accepted owner-authz for execution
 Docker isolated runtime → signed Task/ResultEnvelope → ATHENA postflight / Green Stone / D1
         ↓ Linear receive/order; Manus bridge; n8n/WAVE/Discord adapters as allowed
         ↓ return to verified originating Command/ChatGPT channel
```

**IMPORTANT:** App Server is a Codex process interface, not the ChatGPT application backend, not GH2 GitHub App, and not a substitute for Docker/TMN or sudo. It does not spontaneously attach to the user’s existing ChatGPT account conversations. Cloudflare Worker must not `spawn(codex)`; orchestration calls an independently authorized machine/agent runtime.

## Live test — PASS (bounded)

- Staging branch `feat/ccs-multi-protocol-docker-20261023`; proof script `scripts/codex-app-server-stdio-proof.mjs`; job `.github/workflows/codex-app-server-stdio-proof.yml`.
- [Run 40085880432](https://github.com/Wave-Runner-2/Build-Platform/actions/runs/40085880432) SUCCESS: official CLI `codex-cli 0.164.0`, real stdio JSONL `initialize` response, `initialized` notification, independent `thread/list` result in empty ephemeral CODEX_HOME.
- No model inference, signed-in ChatGPT account, API key, license/entitlement proof, OpenAI paid credit, prompts, file editing, network port, Host runtime, D1 receipt, callback or rollout.
- This is **E2E_ORANGE scoped to the real App Server local PROTOCOL**, not E2E of the Owner’s seven major workstreams.

## API controls / differences to preserve

| Context | Supported implementation | Test / status |
|---|---|---|
| Codex interactive IDE/TMN | App Server over **stdio** or local Unix socket, handshake `initialize` then `initialized`; server approval requests tied to `threadId` and `turnId` | Hosted stdio protocol proven; real OCIAN user login not yet proven |
| Codex automation in GH2 Actions | Use **Codex SDK**, keep sandbox, owner approval and receipt | Not migrated; avoid invoking paid inference without explicit spending allowance |
| App Server Remote WebSocket | Experimental; local loopback + SSH forwarded `ws://` only, else TLS **and** WebSocket capability/signed bearer auth | NOT enabled, production unsupported |
| Copilot TMN | Separate GH Copilot OAuth/subscription; Infisical BYOK only if Owner approves spend | No implicit Copilot entitlement and no paid BYOK activation |
| Owner/ATHENA approvals | Capture `item/commandExecution/requestApproval`, `item/fileChange/requestApproval`, `item/permissions/requestApproval` and map to existing signed Owner capability; decline unknown escalation | Owner-gate integration NOT implemented |
| Model name | Query `model/list` for signed-in account / workspace | No hardcoding hypothetical `gpt-*` names from examples |
| ChatGPT native account return | Requires independently supported receiver per account, origin ID/return_channel/receipt | NOT proven; server thread/list is not ChatGPT two-account return |
| OpenAI `worker/openai-selfhost-api.ts` | Current code calls `/v1/agents/sessions` and uses `OpenAI-Beta: agents=v1` | Legacy route observed in repository; separate compatibility audit required before any migration |
| `codex exec-server` / `codex mcp-server` | Existing WAVE scripts use `exec-server` for host readiness; official Codex SDK documentation says old `codex mcp-server` binary was removed | Do not silently replace existing command without actual CLI version test; migration candidate |

**Auth restriction:** OpenAI's current App Server documentation says built-in App Server authentication is for local/open-source integrations and **not permitted for commercial/hosted services**; use OpenAI’s [Sign in with ChatGPT](https://learn.chatgpt.com/docs/app-server) integration when required for hosted use. No account token reuse between two ChatGPT identities.

## Required next gates (not passed)

1. Verify pinned OCIAN SSH Host identity from an independently trusted Owner machine or DigitalOcean console, then bind GH2 staged runner without touching GH1 archival installation.
2. Verify `codex app-server` **on actual OCIAN** for intended GS user: `codex --version`, non-secret `account/read` auth mode (do not log account identifiers), login entitlement, owner-signed approve/deny and thread events with `stdio`/Unix socket.
3. Owner-approved bounded Codex task inside Docker; actual TaskEnvelope, signed ResultEnvelope, D1 sequence, independent readback. Never map raw App Server `command/exec` or `thread/shellCommand` directly to full sudo.
4. Route signed result via ATHENA / Linear / Manus / WAVE and separately supported ChatGPT return endpoints. Final 7/7 must be proven individually with receipts.
5. Generate JSON Schema/TypeScript from the **exact installed Codex CLI version** before binding into production; do not assume older message shapes, no websocket exposure to public internet.

**Status at time of update:** OpenAI App Server protocol `E2E_ORANGE` in GH2 hosted isolated environment; OCIAN/Codex S-Host operation `PROCESS_BLUE/BLOCKED`, overall seven-workstream Full E2E **0/7**.
