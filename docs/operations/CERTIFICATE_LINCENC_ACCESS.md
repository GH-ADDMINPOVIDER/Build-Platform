> Current naming, 30 Oct 2026: the operational label is `Unifiend capability`. Exact GitHub account, repository, machine and external secret-reference bindings are in `config/github-provider.json`. Historical observations below retain their original spelling and dates; they are not current permission claims. GitHub connector metadata currently reports repository admin access; runtime PAT grants require their own checks.

# OGENIC/Unifiend Certificate lincenc — Canonical Discovery

Record type: Owner Authorization and Plugin Evidence Registry; NOT an SSL/TLS certificate, X.509 issuance, OAuth token, or permission to execute commands.

Canonical Certificate ID: oge-128-wave-runner-01-baseline-20261018

Original (single) certificate: https://github.com/Ogenicchocolate21debug/Build-Platform/blob/task/oge-128-runtime-certificate-20261018/.ogenic/proofs/oge-128-wave-runner-01-certificate-baseline.json

The staging branch intentionally does not contain a duplicate certificate JSON. The authoritative operational copy is the existing Cloudflare D1 database ogenic-phase-vi-staging, table certificate_lincenc, keyed by the same Certificate ID.

READ PATHS
1. Unifiend Owner Session: GET https://wave.ogenicchocolate.com/api/system/certificate-lincenc (read-only, authentication required, no-store, safe allowlisted projection).
2. ATHENA default chat: certificate_lincenc_status (eighth private read-only function tool; live D1 row).
3. Unifiend Operations UI /overview: Certificate lincenc card, distinct historical evidence versus current E2E.
4. Outside ChatGPT / agents: use the canonical GitHub branch and file path with the agent's own GitHub read access; a different ChatGPT session is not automatically authenticated to Unifiend.

IDENTITIES FROM OWNER CORRECTION
Retired store principal — historical owner metadata only; no longer a runtime credential or dispatch source.
GH_ADDMINPROVIDER / Tomload21 — `tomload21@gmail.com`; GitHub `Wave-Runner-2` (numeric ID `342175560`), existing `wave-runner-01`; repository permission `write`; role is Platform Engineer for staging. This is the canonical Infisical secret name and dispatch source.
Codex GS: historical /home/wave/.codex. Codex TS: historical /root/.codex, execution proof run 39124078680.
One self-hosted machine: `SELF_HOST_MACHINE`, physical hostname `OCIAN-S-Host`, GitHub registration `wave-runner-01`, DigitalOcean Droplet `604432491`.

IDENTITY AND CREDENTIAL-REFERENCE CONTRACT
| Principal | Login / numeric ID | Owner-assigned role | Observed repository permission | Canonical credential reference |
| --- | --- | --- | --- | --- |
| Retired store principal | `Ogenicchocolate21debug` / `306097555` | Historical repository owner/admin and Cloudflare custodian | historical | Retired; not a runtime binding |
| GH_ADDMINPROVIDER / Tomload21 | `Wave-Runner-2` / `342175560` | Platform Engineer (staging) | `write` observed; Admin unverified | `GH_ADDMINPROVIDER` (canonical) |

The previous store and runner-alias labels are retired. Every staging consumer now resolves the single canonical `GH_ADDMINPROVIDER` reference; no raw token is copied or logged. `Wave-Runner-2` uses a hyphen in every machine-readable identity.

There is one physical self-host machine, `SELF_HOST_MACHINE` (physical hostname `OCIAN-S-Host`, GitHub registration `wave-runner-01`, DigitalOcean Droplet `604432491`). GH_ADDMINPROVIDER is a GitHub account and credential principal on that existing runner, not a second runner. Linear and Google Drive live read/write verification is `READ_UNAVAILABLE` in this environment because no corresponding connector is exposed; this document records the source contract only and does not claim external updates.

PROOF CONSTRAINTS
Cloudflare D1 record read is validated by SHA-256; if missing, corrupted or inaccessible, return an explicit error.
Plugin read-API proofs are historical snapshots; Certificate does not grant GitHub Actions dispatch write or current command E2E.
No creation of another Certificate, D1 schema, token, Identity, machine or approval bypass.
