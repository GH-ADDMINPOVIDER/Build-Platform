# OGE-19 — Actual App Capability Matrix

Canonical scope: `Ogenicchocolate21debug/Build-Platform` / `Unified-on-Progress`.

This matrix is an evidence-oriented inventory. **Available** does not imply authenticated. **Connected** is used only where the current control surface produced live evidence. No secret values belong in this document or in D1/1LSS.

## Classification

- `KEEP IN MOBILE` — frequent owner capability worth exposing in Unifiend.
- `MORE` — valid capability, but better behind secondary/admin UI.
- `HIDDEN` — infrastructure/runtime capability; not a normal end-user app button.
- `BLOCKED` — unavailable, frozen, partner-gated, or not live-verified.

## Current matrix

| Surface | Current evidence / connection | Read | Write / execute | Auth/session source | Preferred adapter | Fallback | Risk / approval | Mobile |
|---|---|---:|---:|---|---|---|---|---|
| Linear | Connected plugin; live issue read/write used during canonical OGENIC work | Yes | Yes | Connected Linear account | Native Linear connector | Yellow Stone/provider adapter | Writes require scoped intent; consequential changes follow policy | KEEP IN MOBILE |
| GitHub | Connected plugin; canonical branch/workflow evidence read and Actions reruns executed | Yes | Yes | GitHub app/connected account | Native GitHub connector / Actions | `wave-runner-01` self-host lane | Branch lock; no main/prod; destructive operations approval-gated | KEEP IN MOBILE |
| Notion | ChatGPT connector surface available; live auth not re-proven in this audit | Potential | Potential | OAuth connector | Native Notion connector | Exported/canonical repo docs | Treat auth as `UNVERIFIED` until live call | MORE |
| Google Drive | ChatGPT connector surface available; canonical file workflows supported, auth not re-proven here | Potential | Potential | Google OAuth | Native Drive connector | Files/Library when appropriate | Write requires explicit scoped action | KEEP IN MOBILE |
| OpenAI Developers | OpenAI Platform connector available; self-host Agents runtime proved through OGE-28 | Yes | Yes | Project API key + dedicated Environment key server-side | OpenAI API / Agents runtime | Function tools / self-host executor | Keys never enter prompts; execution remains Yellow Stone governed | KEEP IN MOBILE |
| Manus | Native Manus plugin available; provider runtime is external to OpenAI | Yes* | Yes* | Connected Manus plugin | Manus connector | Other registered provider | Provider actions must remain capability/policy bounded | MORE |
| Cloudflare Workers + D1 | Canonical runtime/state path; OGE-25/26/27/28/32 runtime evidence exists | Yes | Yes | Worker bindings / owner auth / server-side secrets | Cloudflare Worker + D1 | None for canonical operational state | Canonical control boundary; schema mutation separately approved | HIDDEN |
| LINE OA | Server-side connector/hook implementation exists; current credential health not freshly proven here | Potential | Potential | Infisical/Worker secret refs | Direct Messaging API via Worker | n8n only if registered/live | Customer-visible outbound action requires approval | KEEP IN MOBILE |
| Meta (Facebook/Instagram) | Server-side connector/readiness workflows exist; current App Secret/runtime health not freshly proven here | Potential | Potential | Server-side Meta credentials | Direct Meta API via Worker | registered workflow adapter | Exact auth state required; no fake LIVE | MORE |
| Gmail | ChatGPT connector surface available; auth not re-proven here | Potential | Potential | Google OAuth | Native Gmail connector | none | Sending/modifying mail is consequential | KEEP IN MOBILE |
| Google Calendar | ChatGPT connector surface available; auth not re-proven here | Potential | Potential | Google OAuth | Native Calendar connector | none | Event writes require explicit scoped action | MORE |
| Figma | Native connector surface available; auth not re-proven here | Potential | Potential | Figma connector/OAuth | Native Figma connector | exported design artifact | Writes only when requested | MORE |
| Vercel | Native connector surface available; Unifiend canonical runtime is Cloudflare | Potential | Potential | Vercel OAuth/token | Native Vercel connector | GitHub/Cloudflare staging | Optional legacy deploy; no production promotion without approval | MORE |
| Railway | Native connector surface available; not canonical Unifiend runtime | Potential | Potential | Railway connector | Native Railway connector | self-host/Cloudflare | Infrastructure mutation is consequential | MORE |
| ClickUp | No current in-scope connector surface in this audit | No verified | No verified | Unknown | None until rediscovered | Linear | Do not infer auth from historical inventory | BLOCKED |
| n8n | Server-side connector path exists; no native ChatGPT connector required | Potential | Potential | Infisical/Worker secret refs | Direct registered n8n adapter | Direct HTTP/provider adapter | Truthful `LIVE/DEGRADED/QUOTA_BLOCKED/CONFIGURATION_REQUIRED/OFFLINE`; writes approval-gated | MORE |
| Infisical | OIDC secret injection proved in GitHub Actions, including OGE-28 | Metadata only | Secret delivery only | Machine identity / OIDC | Infisical OIDC | provider-native secret store | Never expose raw values; infrastructure-only | HIDDEN |
| Replit | Native connector surface available; auth not re-proven here | Potential | Potential | Replit connector | Native Replit connector | Codex self-host lane | External build/deploy effects require scoped intent | MORE |
| Shopify | Native connector surface exists, but Candy/Shopify work is frozen by owner direction | Potential | Blocked by scope | Shopify connector / historical Candy workflow | None while frozen | none | **Do not execute Candy/Shopify changes** until owner explicitly unfreezes | BLOCKED |

`*` Manus capabilities depend on the individual Manus action exposed by the connected plugin and must not be generalized beyond the active tool contract.

## Resolver requirements derived from the matrix

1. Deterministic explicit-provider routing first; model classification only for ambiguous requests.
2. Normalize every capability into `provider`, `operation`, `permission_class`, `auth_state`, `runtime_state`, `approval_mode`, and stable evidence/run reference.
3. Reuse the existing Yellow Stone resolver and execution router; do not create a second orchestration authority.
4. Provider health must be honest: `LIVE`, `DEGRADED`, `CONFIGURATION_REQUIRED`, `QUOTA_BLOCKED`, `SIMULATED`, `OFFLINE`, or `UNVERIFIED` where appropriate.
5. Write/execute/dangerous operations require OGE-26 policy/approval and idempotency. Read-only discovery/health may auto-run.
6. Prefer native connected API/connector -> registered server-side API/MCP adapter -> reusable session -> Browser Run -> human takeover.
7. No raw token/password/cookie/SSH material in Unifiend payloads, model prompts, logs, or 1LSS.
8. Preserve `owner-main / 1LSS_OWNER_MAIN` as canonical input/output evidence line.

## D1 decision

**No new D1 schema is required by OGE-19.** Existing runtime/config/1LSS contracts are sufficient for the inventory phase. Any future schema change must be justified separately and is outside this issue.

## Verified gaps

- ClickUp is historical but not available in the current connected-tool surface.
- LINE/Meta/n8n server-side adapters exist, but current provider-specific credential/health state must be proven at runtime before showing `LIVE`.
- Several native ChatGPT connector surfaces are available but were not live-called during this audit; they remain `UNVERIFIED` rather than falsely marked connected.
- Shopify/Candy is deliberately frozen.

This document satisfies the OGE-19 inventory deliverable without enabling credentials, mutating external providers, changing D1 schema, or touching production.