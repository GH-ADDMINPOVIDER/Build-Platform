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
GH1 Tawatchai — Ogenicchocolate21debug, gh-runner1; admin repo role does not imply complete connector scopes.
GH2 Tomload21 — Wave-Runner-2, gh-runner-2; owner selected all available scopes, but live OAuth scope audit remains separate.
Codex GS: historical /home/wave/.codex. Codex TS: historical /root/.codex, execution proof run 39124078680.
One self-hosted Runner host: wave-runner-01, DigitalOcean Droplet 604432491.

PROOF CONSTRAINTS
Cloudflare D1 record read is validated by SHA-256; if missing, corrupted or inaccessible, return an explicit error.
Plugin read-API proofs are historical snapshots; Certificate does not grant GitHub Actions dispatch write or current command E2E.
No creation of another Certificate, D1 schema, token, Identity, machine or approval bypass.
