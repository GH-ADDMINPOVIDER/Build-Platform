# OGENIC/WAVE Certificate lincenc — Canonical Discovery

Record type: Owner Authorization and Plugin Evidence Registry; NOT an SSL/TLS certificate, X.509 issuance, OAuth token, or permission to execute commands.

Canonical Certificate ID: oge-128-wave-runner-01-baseline-20261018

Original (single) certificate: https://github.com/Ogenicchocolate21debug/Build-Platform/blob/task/oge-128-runtime-certificate-20261018/.ogenic/proofs/oge-128-wave-runner-01-certificate-baseline.json

The staging branch intentionally does not contain a duplicate certificate JSON. The authoritative operational copy is the existing Cloudflare D1 database ogenic-phase-vi-staging, table certificate_lincenc, keyed by the same Certificate ID.

READ PATHS
1. WAVE Owner Session: GET https://wave.ogenicchocolate.com/api/system/certificate-lincenc (read-only, authentication required, no-store, safe allowlisted projection).
2. ATHENA default chat: certificate_lincenc_status (eighth private read-only function tool; live D1 row).
3. WAVE Operations UI /overview: Certificate lincenc card, distinct historical evidence versus current E2E.
4. Outside ChatGPT / agents: use the canonical GitHub branch and file path with the agent's own GitHub read access; a different ChatGPT session is not automatically authenticated to WAVE.

IDENTITIES FROM OWNER CORRECTION
GH1 Tawatchai — `tawatchaisamornrum11@gmail.com`; GitHub `Ogenicchocolate21debug` (numeric ID `306097555`), gh-runner1; repository permission `admin`; role is repository owner/admin and Cloudflare credential custodian. Requested display/secret label is `STORE ONLY` (`STORE_ONLY` machine reference); live Infisical rename is pending.
GH2 Tomload21 — `tomload21@gmail.com`; GitHub `Wave-Runner-2` (numeric ID `342175560`), gh-runner2; repository permission `write`; role is Platform Engineer for staging. Requested canonical Infisical secret name is `GH_ADDMINPROVIDER`; live principal/scope verification is pending.
Codex GS: historical /home/wave/.codex. Codex TS: historical /root/.codex, execution proof run 39124078680.
One self-hosted Runner host: wave-runner-01, DigitalOcean Droplet 604432491.

IDENTITY AND CREDENTIAL-REFERENCE CONTRACT
| Principal | Login / numeric ID | Owner-assigned role | Observed repository permission | Canonical credential reference |
| --- | --- | --- | --- | --- |
| GH-1 / Tawatchai | `Ogenicchocolate21debug` / `306097555` | Repository Owner/Admin; Cloudflare credential custodian | `admin` | `STORE_ONLY` (display: `STORE ONLY`; legacy/read-only) |
| GH-2 / Tomload21 | `Wave-Runner-2` / `342175560` | Platform Engineer (staging); requested Admin credential label | `write` observed; Admin unverified | `GH_ADDMINPROVIDER` (requested canonical; live verification pending) |

The screenshot labels `GH_ID_TAWATCHAI_STORE(OLD)` and `GH_ADDMINPROVIDER_ID_TOMLOAD21-2` are **legacy/unrecognized migration labels**. The requested canonical names are `STORE ONLY` (machine-safe reference `STORE_ONLY`) and `GH_ADDMINPROVIDER`. A rename must be performed in Infisical and every consumer verified before the old references are deleted; no raw token is copied or logged. `Wave-Runner-2` uses a hyphen in every machine-readable identity; the underscore spelling is invalid.

There is one physical self-host host, `wave-runner-01` (DigitalOcean Droplet `604432491`). GH-2 is a GitHub account and credential principal, not a second runner. Linear and Google Drive live read/write verification is `READ_UNAVAILABLE` in this environment because no corresponding connector is exposed; this document records the source contract only and does not claim external updates.

PROOF CONSTRAINTS
Cloudflare D1 record read is validated by SHA-256; if missing, corrupted or inaccessible, return an explicit error.
Plugin read-API proofs are historical snapshots; Certificate does not grant GitHub Actions dispatch write or current command E2E.
No creation of another Certificate, D1 schema, token, Identity, machine or approval bypass.
