# WAVE / OGENIC — Owner A2A route lock: External GREEN · Internal RED

> Owner routing correction, 2026-10-23. **Zone colors are not checkpoint PASS/FAIL labels.**
> Staging architecture contract only. Do not alter previously proven CERT green/orange milestones.

## 1. Dual command ingress (independent origin identities)

1. `GS–GT -> Command` (record `origin_kind=GS_GT` and original context/session).
2. `Owner -> Command` (record `origin_kind=OWNER` and original context/session).

Both sources go through the **same bidirectional Manus BRIDGE receive/send**. A bridge may transport intent and outcome, but **cannot mint a signed owner session** or approve the work.

`Command -> Manus signal bridge (inbound) -> WAVE ATHENA / Yellow authorization -> GH_ADDMIN_POVIDER (GH2) + Infisical OIDC -> zone router`

## 2. Explicit mutually understood execution zones

**EXTERNAL (GREEN zone — color means external, not E2E PASS)**:

- `n8n + Railway` host and run the external workflow/tool/protocol services.
- Register connector protocols and broker authorized tool calls, MCP, API, Webhook, A2A, n8n workflow, callback and scoped retries **in this zone**, without relocating an entire vendor plugin installation or pasting provider credentials.
- The WAVE CCS/1.0 15-mode contract is a capability/transport inventory; no claim that every mode is an independently executable provider.

**INTERNAL (RED zone — color means internal, not FAIL)**:

- `Terminal SSH + IDEs + OPC` and `Docker Container` on the existing OCIAN-S HOST handle internal command/tool/coding execution.
- **Codex GS = primary internal code-fix / agent execution** behind the authenticated WAVE/Yellow -> GH2/TMN command route; keep its existing local profile separate from any other Codex account.
- **GitHub Copilot = Terminal/IDE coding assistant tool**, not another GitHub operational identity and not the self-hosted Actions runner. It belongs inside TMN's SSH/IDEs/OPC tool surface, not in the External connector runtime.
- Docker provides compute, process isolation and transient workspace, **not an automatic durable data store**.
- `RP_STORE(OLD)`/GH1 stays outside the active execution path as an unchanged recovery/reference source. No GH1 execution or silent migration.

### 2.1 Backup / fallback pool — not an implicit execute-right escalation

| Backup | Placement | Authorized use | Guard |
|---|---|---|---|
| `RP_STORE(OLD)` / Store | Outside hot execution path (cold source/Context lookup) | When primary GH2 files/context are unavailable, retrieve immutable source by exact SHA into isolated read-only workspace | Never become primary command or runner, never silently deploy legacy source |
| Gemini (API) | External model provider through registered n8n/WAVE connector | Bounded READ reasoning / research / context fallback | Must verify identity, allowed model, API quota and owner-approved capability; cannot replace Docker/SSH execution |
| DeepSeek API | External model provider through registered n8n/WAVE connector | Bounded reasoning / debugging / code-analysis fallback | Verify existing Infisical binding and paid-call policy before invocation; cannot replace shell execution |

Backups are **conditional capabilities**, not always-on live fallbacks. Linear can record fallback requests; Manus can bridge authorized requests/results. Neither can bypass Yellow/Owner authority.

### 2.2 Historical host evidence — limits of current proof

- GH1 historical self-hosted job [39701916640](https://github.com/Ogenicchocolate21debug/Build-Platform/actions/runs/39701916640), 2026-10-22: `OCIAN_COPILOT_USERLOCAL=VERSION_OK_AUTH_UNVERIFIED`; **Copilot binary/version detected, login/inference not proven**.
- Same run: `OCIAN_GS_CODEX_PROFILE=SIGNED_IN` and `OCIAN_OPENCODE_USERLOCAL=INSTALLED`, OpenCode CLI version PASS with `PROVIDER_AUTH=NOT_ATTEMPTED`.
- Same run: SSH service ACTIVE; `OCIAN_IDE_VSCODE_SERVER`, `OCIAN_IDE_VSCODE_REMOTE`, `OCIAN_IDE_CODE_SERVER`, `OCIAN_IDE_CURSOR_SERVER` all `NOT_INSTALLED_FOR_RUNNER_USER`. Do not label remote IDE tooling as E2E-ready.
- This is host evidence from GH1 **historical source only**; it does not authorize GH1 as the current execution plane. GH2 host runner and full internal A2A return E2E remain separate outstanding gates.

**Cross-zone signaling**:

- `EXTERNAL/GREEN <-> Manus Bridge <-> INTERNAL/RED` is a **proposed authenticated transport**; Manus carries signals/events/receipts, not raw secrets or unrestricted shell commands.
- n8n/Railway can use its own workflow runtime; do not force all external tool calls through OCIAN Docker.
- GH2/Infisical identity and Owner/Yellow capability are mandatory at the specific execution adapter; no broad cross-account or host rights inferred by role labels.

## 3. Post-execution evidence and dispatch

`External n8n/Railway OR Internal Docker -> ATHENA post-run verification -> canonical Registry / D1 -> Green Stone verification -> Linear (RECEIVE + ORDER + Back Context) -> Manus bridge (outbound) -> GH2 or n8n authenticated delivery adapter -> destinations`

Destination A: `WAVE Command` (existing WAVE API session/receipt channel).

Destination B: `ChatGPT account GS–GT` **only through a connected, authorized, supported message-delivery surface**.

Destination C: `ChatGPT account Owner` **only through its independently connected, authorized, supported message-delivery surface**.

**No false direct-delivery claim:** Neither Manus nor Linear independently injects messages into existing private ChatGPT conversations. Using GitHub/n8n to emit a webhook does not by itself give access to either ChatGPT UI account. Prove account-specific callback/polling/connected-app transport before marking delivered. If absent, return an authenticated WAVE Command inbox link/status and store the receipt; do not call it ChatGPT callback E2E.

## 4. Function separation

| Component | Function | Hard boundary |
|---|---|---|
| Manus | Bridge RECEIVE + SEND, signal relay, correlation | Not approval authority, not secret storage |
| Linear | RECEIVE + ORDER, Back Context, eligible delegated agent tasks | Not OCIAN's Docker/SSH runner by default |
| n8n/Railway | External tool/protocol registry, workflow runtime, calling/retry, return-delivery adapter | Not unchecked sudo or independent owner-sign grant |
| Codex GS | Primary internal coding agent and execution via gated TMN tool adapter | Existing signed-in profile does not mean GH2 runner dispatch works | 
| GitHub Copilot | TMN Terminal/IDE assistant tool | Historical version present; AUTH/real calling UNVERIFIED | 
| Terminal/Docker | Internal shell/tool/agent execution within approved host | No open public port, no inherent persistence | 
| Store, Gemini, DeepSeek API | Cold source recovery and scoped model analysis fallbacks | Never automatic owner-sign, paid-call or host-execution bypass |
| ATHENA/Yellow | Pre-execution owner/permission policy | Must run BEFORE meaningful side effects |
| ATHENA/Registry/Green Stone | Post-execution attestation and durable result verification | No retrospective bypass of authorization |
| GH_ADDMIN_POVIDER + Infisical OIDC | Operational GitHub + least-privilege credential broker | No GH1 command fallback, no raw secrets in logs/cards |

## 5. Stable A2A result envelope and fallback

Required metadata: `task_id`, `origin_kind=GS_GT|OWNER`, `origin_session_ref`, `return_channel=COMMAND|CHAT`, `reply_to` (registered destination ID, never plaintext session cookie), `context_ref`, `context_revision`, `ccs_mode`, `approval_ref`, `runner_ref`, `zone`, `provider_ref`, `result_sha256`, `registry_receipt_ref`, `green_stone_attestation_ref`, `linear_issue_ref`, `manus_delivery_ref`, `delivery_status`, `fallback_reason`.

Default fallback: **fail closed** to read-only/status-inbox and Linear escalation if a connector, auth, webhook, ChatGPT return transport, or host runner is unavailable. No cross-zone execution retry or credential re-routing without previously registered explicit capability and valid authorization.

## 6. Evidence, not inferred completion

- GH2 hosted Docker CCS 15-mode multi contract, OIDC root names and isolated real-secret bytes stdin SHA check (5/5): [Run 39944510755](https://github.com/Wave-Runner-2/Build-Platform/actions/runs/39944510755), **within GH2 hosted CI scope**.
- Previous n8n/Railway service online: CERT CP-028 GREEN for runtime status **only**, not n8n workflow calling E2E.
- GH2 OCIAN SSH/Docker host activation [Run 39937839755](https://github.com/Wave-Runner-2/Build-Platform/actions/runs/39937839755) **QUEUED** at last read.
- Manus bidirectional signal, Linear dispatch and independent return to two ChatGPT UI accounts: **NOT PROVEN E2E**.
- Preserve CERT original source, previously GREEN/ORANGE milestones; do not elevate any new milestone without explicit task/result/receipt and destination-side readback.

## 7. Owner correction — INTERNAL Infisical + SUDO TERMINAL MODE (2026-10-23)

**Internal topology:**

`WAVE Command [GS–GT or Owner] -> Manus signal bridge -> ATHENA/Yellow owner/capability preflight -> GH_ADDMIN_POVIDER (GH2) + Infisical identity/credential broker -> controlled SUDO TERMINAL MODE [SSH + IDEs + OPC + LCI + Codex GS + GitHub Copilot CLI TMN] -> private Docker Container -> result -> ATHENA/Registry/D1/Green Stone -> Linear Receive/Order -> Manus callback -> registered GH2/n8n return adapter -> matching origin`

**Infisical machine-identity authorization:** place the permission broker in the INTERNAL trust boundary with Copilot/TMN, while retaining external n8n/Railway connector orchestration. Infisical controls identity auth method, environment/project role and secret read privileges; it does not independently grant Linux sudo, SSH shell, GitHub repository write rights or GitHub Copilot subscriptions.

**Route A — GH2 OIDC, existing verified path:** GitHub Actions runner obtains **GitHub-signed OIDC JWT** with narrow repo/branch/environment audience+subject claims; Infisical validates it and issues a short-lived Machine Identity token; GH2 retrieves only approved staging secret bindings. The **OIDC trust direction is GitHub -> Infisical**, even if the operational secret-delivery direction is Infisical -> GH2. Existing GH2 OIDC proof remains scoped to the tested CI workflow.

**Route B — Copilot TMN credential mode:** an authorized Copilot CLI/Tool process may request an approved **Provider BYOK** key via the internal Infisical credential broker and receive a short-lived scoped injection (process environment/stdin/ephemeral mount, never CLI log, Git, Linear, Manus or Card content). **Do not claim Copilot CLI natively authenticates to Infisical via GH2 OIDC.** A Copilot **subscription** still requires a separate GitHub OAuth/token entitlement; an Infisical secret alone does not confer it. BYOK provider calls can accrue vendor charges and must be limited to approved bounds.

**SUDO TERMINAL MODE is a gated command capability, not a blanket root grant:** require a verified Owner+Yellow grant that includes `task_id`, operation allowlist, duration, target user/host, environment=staging and audit receipt. Default to unprivileged `wave` runtime. Where sudo is needed, permit only explicitly approved operations with timeouts and evidence. No unconditional `NOPASSWD: ALL`, no implicit privilege escalation for IDEs/OPC/LCI/Copilot/Codex, no `docker.sock` inside generic A2A containers.

**Internal status by direct host evidence (2026-10-22, GitHub historic run 39701916640):** Copilot local CLI `VERSION_OK_AUTH_UNVERIFIED`; Codex GS profile `SIGNED_IN`; OpenCode local installed with provider auth unverified; SSH active; standalone remote IDE servers not yet verified installed for runner user. Do not mistake a locally installed binary or plugin listing for live Copilot Calling.

**Fail-closed provider selection:** GH2 credential grant and Copilot BYOK binding require independent authorization. If Copilot auth or BYOK connector is unverified, return `CONFIGURATION_REQUIRED` and preserve task context for Linear/Manus without switching to an unapproved paid model. Cold Store, Gemini and DeepSeek are separately registered fallbacks; no production/secret mutation.

**Sources:** [Infisical Machine Identities](https://infisical.com/docs/documentation/platform/identities/machine-identities), [Infisical GitHub OIDC](https://infisical.com/docs/documentation/platform/identities/oidc-auth/github), [GitHub Copilot CLI Auth](https://docs.github.com/en/copilot/how-tos/copilot-cli/set-up-copilot-cli/authenticate-copilot-cli).
