# OGENIC • OGE Bug Memory

**Goal:** recognize a repeated failure by its exact identity and reuse verified recovery steps. Don't interpret HTTP 404 / 409 in isolation.

## Where the evidence lives
- **Versioned master:** `config/oge-error-memory.json` on staging GitHub (links to real CI runs and fixes)
- **Issue history:** comment under the **existing** matching Linear OGE, not a duplicate ticket
- **Unifiend query:** `GET /api/knowledge-refinery/incident?oge=OGE-35&http=404` authenticated as owner/ops, read-only
- **D1:** canonical application/session data stays in owner-main/1LSS; no new D1 table or schema and no raw CI logs/credentials stored there

## 3-second reuse
```sh
node scripts/oge-incident-memory.mjs lookup --oge OGE-35 --http 404 --component athena-yellow-resolver
node scripts/oge-incident-memory.mjs lookup --oge OGE-67 --http 409 --code RESOLVER_UNAVAILABLE
node scripts/oge-incident-memory.mjs lookup --oge OGE-10 --code 4049
```
The third command correctly reports *not yet recorded*, instead of guessing from 404 on another issue. **4049** is a user-defined application error identifier, not a normal HTTP status; pass it as `--code`.

If brand new, record only a sourced and unverified fingerprint, then commit the changed JSON to staging and paste evidence into that Linear OGE:
```sh
node scripts/oge-incident-memory.mjs record --oge OGE-10 --http 404 --component yellow-resolver --symptom ROUTE_UNAVAILABLE --evidence https://github.com/Ogenicchocolate21debug/Build-Platform/actions/runs/123456
```
The example URL/run ID is a placeholder; replace it with a **real** failure run. Never include secrets or private output.

The saved fields are OGE number, surface/component, HTTP and structured code, symptom, root-cause confidence, diagnostic steps, fix, evidence, owner action. When a fix passes real CI/runtime, change status to `FIX_VERIFIED` with the proof commit. If evidence is insufficient, retain `OPEN_DIAGNOSIS` and `UNVERIFIED`. A successful GitHub Actions artifact alone does not guarantee a live bug is fixed.

## Repeatable triage
1. Read actual Log + issue + API error. Check catalog before re-running paid tools.
2. Match **OGE + component + exact code** (or HTTP if structured code absent).
3. Try only the listed *safe read-only diagnostics* before editing code.
4. Verify changed contract & staging runtime, then update existing OGE and source record.
5. Do not change authorization, turn on forbidden capabilities or bypass Ruby to achieve expected HTTP numbers.

No new policy gate, database, hidden inference request or new issue is needed.
