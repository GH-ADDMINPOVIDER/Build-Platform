# GH-ADDMINPROVIDER Handoff Contract

## Canonical path

`WAVE Chat → signed Owner Session → Agent Sign envelope → GH-ADDMINPROVIDER → OCIAN-S-Host Terminal Solo → D1 COMMAND_RESULT`

## What “handoff” means

A handoff is an explicit, durable transfer of one approved command. It is not a chat-forward, a copied token, or permission inherited by another agent.

The submitted envelope contains only:
- task ID and idempotency key
- command digest and declared staging scope
- capability and provider identifiers
- credential reference identifiers, never credential values
- signed Owner-session decision
- executor acknowledgement and result/evidence reference

The envelope is accepted exactly once per idempotency key. Completion is true only after the D1 result receipt is read back.

## Ownership

| Component | Owns |
| --- | --- |
| WAVE Chat | command intent and presentation |
| Signed Owner Session | command authorization |
| Agent Sign | immutable task/envelope creation |
| GH-ADDMINPROVIDER | dispatch authorization and workflow admission |
| OCIAN-S-Host Terminal Solo | one-at-a-time execution |
| D1 | durable task/event/result receipt |
| Infisical or provider OAuth | credential values and lifecycle |

## Credential rules

- Browser/WAVE Chat never stores a provider token, API key, OAuth refresh token, or Owner key.
- A provider is selected by its registered ID and secret reference only.
- Bridge mode uses a server-side GH-ADDMINPROVIDER dispatch credential from the approved secret manager.
- OAuth mode uses the provider's authorization/device flow and retains its credential in the approved secret manager, not D1.
- Missing configuration fails closed; it never falls back to a historical identity.

## Runtime configuration

GH-ADDMINPROVIDER repository variables are the one source of non-secret runtime identity:
- `GH_ADDMINPROVIDER_REPOSITORY`
- `GH_ADDMINPROVIDER_HOST`
- `GH_ADDMINPROVIDER_STAGING_REF`
- `GH_ADDMINPROVIDER_RUNNER_LABELS_JSON`
- `GH_ADDMINPROVIDER_WAVE_URL`
- `GH_ADDMINPROVIDER_WORKFLOW`

Credential values remain in Infisical/provider OAuth bindings and are exposed only to the required runtime.

## State transitions

`DRAFT → OWNER_SIGNED → QUEUED → DISPATCHED → RUNNING → COMMAND_RESULT_(DONE|FAILED|BLOCKED)`

Retries retain the same idempotency identity. Terminal Solo serializes execution on OCIAN-S-Host. A D1 readback is required before reporting DONE.

## Enablement order

1. Configure GH-ADDMINPROVIDER runtime variables and secret references.
2. Register OCIAN-S-Host as the one self-hosted runner for GH-ADDMINPROVIDER.
3. Run one staging command with an Owner session.
4. Verify the GitHub Actions run and D1 COMMAND_RESULT readback.
5. Only then retire legacy routes.

No production activation, raw-token entry, or legacy-route deletion occurs through this document.
