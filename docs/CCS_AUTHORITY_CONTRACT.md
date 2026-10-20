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

- **Operational primary = GH-2 / Tomload21**, GitHub login `Wave_Runner-2`, numeric identity `342175560`. WAVE GitHub Actions Dispatch uses the **GH-2 PAT** only after a live principal match and an Actions-write invalid-ref `422` canary. It is not a second physical Runner host.
- **Repository owner and Cloudflare credential custodian = GH-1 / Tawatchai**, login `Ogenicchocolate21debug`, numeric identity `306097555`. GH-1 remains repo Admin; GH-2 currently has repository Write via the linked connector. No Admin elevation or default-branch change is implied.
- Canonical source of GH-2 runtime PAT: existing Infisical **staging** bindings `GH-ID-TOMLOAD-RUNNER-2` (Classic PAT, verified Actions-write) or verified fine-grained alternative `GIT_HUB_RUNNER-2` when valid. Do not substitute `GITHUB_TOKEN_OGE34` (GH-1 read-only) for WAVE Dispatch.
- Canonical Cloudflare deployment credential source remains the pre-existing Infisical staging project via GitHub OIDC; do not duplicate, transfer or expose Cloudflare tokens.
- Existing staging deploy selects GH-2 by a real principal + Actions write check before assembling the Worker protected runtime bundle. Any missing/mismatched GH-2 binding **fails closed**, instead of silently reverting to GH-1 Dispatch 403.
- Production, Candy, Cloudflare database schema, SSH identities and Runner configuration are unchanged. Worker queues are not `COMMAND_RESULT_DONE` unless a genuine Runner execution receipt is observed.
