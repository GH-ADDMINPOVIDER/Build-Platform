# CCS Authority Contract

- Child/effective authority cannot exceed parent provider, capability, permission, environment, expiry or egress scope.
- Revocation is lineage-aware and cached references fail closed after ancestor revocation.
- Invocation authorization is independent from discovery.
- Egress is checked against normalized allowed origins.
- Public authority metadata excludes credential-bearing fields.
- Runtime credential custody remains brokered; references must use `vault://` or `binding://` forms.
- No hidden cross-provider fallback.

The current live CCS surface remains a bounded/read-oriented control facade. Future side-effecting adapters must call the invocation authorization boundary before provider execution.

## WAVE Staging GitHub Primary Routing — Owner decision 2026-10-20

- **Operational primary = GH_ADDMINPROVIDER / Tomload21**, GitHub login `Wave-Runner-2`, numeric identity `342175560`. WAVE GitHub Actions Dispatch uses this canonical provider only after a live principal match and an Actions-write invalid-ref `422` canary. It runs on the existing single self-hosted runner.
- **Retired store principal = historical owner/custodian metadata**, login `Ogenicchocolate21debug`, numeric identity `306097555`. It is not a runtime dispatch source; no store fallback is permitted.
- **Canonical Infisical reference (2026-10-26):** staging dispatch label is `GH_ADDMINPROVIDER`. All prior store and runner-alias names are retired after cutover. Do not substitute a retired reference for GH_ADDMINPROVIDER.
- Canonical Cloudflare deployment credential source remains the pre-existing Infisical staging project via GitHub OIDC; do not duplicate, transfer or expose Cloudflare tokens.
- Existing staging deploy selects GH_ADDMINPROVIDER by a real principal + Actions write check before assembling the Worker protected runtime bundle. Any missing/mismatched canonical binding **fails closed**, instead of silently reverting to a retired store credential.
- Production, Candy, Cloudflare database schema, SSH identities and Runner configuration are unchanged. Worker queues are not `COMMAND_RESULT_DONE` unless a genuine Runner execution receipt is observed.

## Requested terminal route — 26 Oct 2026

`GPT/Owner → GH_ADDMINPROVIDER → Infisical staging OIDC → SELF_HOST_MACHINE (registration wave-runner-01) → Codex → Docker/self-host ocean` is the requested route. The repository selects only the `GH_ADDMINPROVIDER` reference and rejects retired store credentials. This route remains `E2E_PENDING` until the external secret exists, the GitHub principal matches ID `342175560`, the Actions-write invalid-ref canary returns `422`, and a real bounded Codex/Runner receipt is recorded.

## Platform Engineer — GH_ADDMINPROVIDER / Tomload21 (Owner assignment, 21 Oct 2026)

**Operational role:** `Platform Engineer` for the existing OGENIC/WAVE **staging** platform. This is an Owner-assigned operational job function, **not** a GitHub built-in repository permission or an assertion of additional OAuth/token scopes.

**Bound principal:** login `Wave-Runner-2`, GitHub user ID `342175560` (Owner label `Tomload21`). Identity must match the actual authenticated GitHub principal before any delegated invocation. **Do not confuse this GitHub account with a second physical GitHub Actions runner.** The existing execution machine is `SELF_HOST_MACHINE`, physical hostname `OCIAN-S-Host`, with GitHub registration `wave-runner-01`.

**Accountable platform duties (within previously verified capabilities):**
- Maintain and troubleshoot staging source integrations, GitHub Actions/workflow dispatch, branch CI, and deployment coordination for `Ogenicchocolate21debug/Build-Platform`.
- Use the **GH_ADDMINPROVIDER staging Actions Dispatch** credential binding through the existing Infisical/Worker route, including a real principal and Actions-write preflight; never substitute a retired store credential or copy raw PATs into repo files. The binding is not considered live until a principal check plus Actions-write `422` canary succeeds.
- Route approved work to the existing `SELF_HOST_MACHINE` (`wave-runner-01`) and coordinate Codex GS/TS and the ATHENA/Yellow/Ruby/Green operating chain; collect exact SHA, job, dispatch, result, and canonical D1 evidence before claiming E2E/DONE.
- Apply scoped fixes, tests and source commits **only using permissions actually verified for the invoking token**. Escalate real permission/scope failures to Owner with the failing capability and HTTP result, without pretending that a broad installation checkbox means that every invocation can write.

**Authority boundaries:** GH_ADDMINPROVIDER is **not Owner, repo Admin, Cloudflare credential custodian, an additional Runner host, or an independent security gate**. GitHub collaborator level observed is `write`, not `admin`; the 422 invalid-ref canary proved Actions-write admission only, not live command completion. No production/main/Candy, Cloudflare/D1 schema or data, Infisical/secret rotation, credential grants, billing, or other privileged state changes without the corresponding existing scope and fresh Owner authorization. Yellow enforces actual capability/lease scope; Ruby verifies; Green/1LSS stores verified evidence. Revocation and least privilege still apply.

**Role verification:** Read `AGENTS.md` and this contract, check staging HEAD, independently verify the GH_ADDMINPROVIDER principal and token's required permission at invocation time, then check the existing runner result and D1 receipt. Store failure distinctly as `NOT_VERIFIED`/`BLOCKED_AUTH`, not as an Owner-approved operation.
