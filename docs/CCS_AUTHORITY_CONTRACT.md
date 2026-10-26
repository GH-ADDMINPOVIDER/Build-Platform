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

- **Operational primary = GH-2 / Tomload21**, GitHub login `Wave-Runner-2`, numeric identity `342175560`. WAVE GitHub Actions Dispatch uses the **GH-2 PAT** only after a live principal match and an Actions-write invalid-ref `422` canary. It is not a second physical Runner host.
- **Repository owner and Cloudflare credential custodian = GH-1 / Tawatchai**, login `Ogenicchocolate21debug`, numeric identity `306097555`. GH-1 remains repo Admin; GH-2 currently has repository Write via the linked connector. No Admin elevation or default-branch change is implied.
- **Requested canonical Infisical references (2026-10-26):** GH-1 legacy/read-only label is `STORE_ONLY` (display label `STORE ONLY`); GH-2 staging dispatch label is `GH_ADDMINPROVIDER`. The former `GH-ID-TOMLOAD-RUNNER-2` and `GIT_HUB_RUNNER-2` names remain migration aliases only until their values are retired after a verified cutover. Do not substitute `STORE_ONLY` for GH-2 dispatch.
- Canonical Cloudflare deployment credential source remains the pre-existing Infisical staging project via GitHub OIDC; do not duplicate, transfer or expose Cloudflare tokens.
- Existing staging deploy selects GH-2 by a real principal + Actions write check before assembling the Worker protected runtime bundle. Any missing/mismatched GH-2 binding **fails closed**, instead of silently reverting to GH-1 Dispatch 403.
- Production, Candy, Cloudflare database schema, SSH identities and Runner configuration are unchanged. Worker queues are not `COMMAND_RESULT_DONE` unless a genuine Runner execution receipt is observed.

## Platform Engineer — GH-2 / Tomload21 (Owner assignment, 21 Oct 2026)

**Operational role:** `Platform Engineer` for the existing OGENIC/WAVE **staging** platform. This is an Owner-assigned operational job function, **not** a GitHub built-in repository permission or an assertion of additional OAuth/token scopes.

**Bound principal:** GitHub account 2, login `Wave-Runner-2`, GitHub user ID `342175560` (Owner label `Tomload21`, GH Runner-2). Identity must match the actual authenticated GitHub principal before any delegated invocation. **Do not confuse this GitHub account with a second physical GitHub Actions runner.** The existing execution host is `wave-runner-01`.

**Accountable platform duties (within previously verified capabilities):**
- Maintain and troubleshoot staging source integrations, GitHub Actions/workflow dispatch, branch CI, and deployment coordination for `Ogenicchocolate21debug/Build-Platform`.
- Use the requested **GH-2 staging Actions Dispatch** credential binding `GH_ADDMINPROVIDER` through the existing Infisical/Worker route, including a real principal and Actions-write preflight; never substitute the GH-1 `STORE_ONLY` legacy/read-only credential or copy raw PATs into repo files. The new name is not considered live until a principal check plus Actions-write `422` canary succeeds.
- Route approved work to the existing `wave-runner-01` and coordinate Codex GS/TS and the ATHENA/Yellow/Ruby/Green operating chain; collect exact SHA, job, dispatch, result, and canonical D1 evidence before claiming E2E/DONE.
- Apply scoped fixes, tests and source commits **only using permissions actually verified for the invoking token**. Escalate real permission/scope failures to Owner with the failing capability and HTTP result, without pretending that a broad installation checkbox means that every invocation can write.

**Authority boundaries:** GH-2 is **not Owner, repo Admin, Cloudflare credential custodian, an additional Runner host, or an independent security gate**. GitHub collaborator level observed is `write`, not `admin`; the 422 invalid-ref canary proved Actions-write admission only, not live command completion. No production/main/Candy, Cloudflare/D1 schema or data, Infisical/secret rotation, credential grants, billing, or other privileged state changes without the corresponding existing scope and fresh Owner authorization. Yellow enforces actual capability/lease scope; Ruby verifies; Green/1LSS stores verified evidence. Revocation and least privilege still apply.

**Role verification:** Read `AGENTS.md` and this contract, check staging HEAD, independently verify the GH-2 principal and token's required permission at invocation time, then check Runner result and D1 receipt. Store failure distinctly as `NOT_VERIFIED`/`BLOCKED_AUTH`, not as an Owner-approved operation.
