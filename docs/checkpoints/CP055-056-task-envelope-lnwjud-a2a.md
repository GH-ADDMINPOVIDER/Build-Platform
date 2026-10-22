# CP-055 / CP-056 — WAVE Task Envelope + lnwjud/A2A staging runbook

Status: `PENDING_BLUE` until Work produces runtime evidence.
Scope: GH_ADDMIN_POVIDER private repo only. Staging only. No production deploy. No secret migration. No sudo enablement.

## Locked decision

1. WAVE remains the canonical control center with D1, ATHENA, Yellow Stone, LINCENC, and existing TMN/OPC/IDEs/Copilot LCI/Codex S-Host lanes.
2. `engasnm111/lnwjud` is the preferred runtime/MCP framework candidate because its current upstream contains durable goal state, context capsule, checkpoints, lease/fencing, task protocol, and delivery receipt concepts.
3. Google A2A is used only as the task/message contract for inter-agent compatibility. It is not a terminal executor and does not replace TMN.
4. From GPT's view the exposed surface must collapse to `TASK IN` and `RESULT OUT`.
5. GH1 remains `RP_STORE(OLD)` / Free Store only. GH_ADDMIN_POVIDER is the main controller.

## Source pins verified before this branch

- WAVE GH2 private source: `Wave-Runner-2/Build-Platform`.
- PR#7 source head: `085bb75a8d686cc0d75c3fbe4eed2453d5289119`.
- `lnwjud` upstream main observed: `d7da7d3dc8e0bd9b44010b2a1eb7ddaa43d2c741`.
- `lnwjud` license: MIT, retain copyright and permission notice if code is copied.
- A2A upstream main observed: `98279d62316361ba8451eaef300f72b72e169185`.

## Files added by this branch

- `worker/task-envelope-contract.ts` — standalone type/validation mapper for `wave.task.envelope.v1` and thin A2A message conversion.
- `database/migrations/0018_task_envelope_routing.sql` — additive D1 schema for task envelope, routing events, and result receipts.

No runtime route is wired yet. This is intentional: Work must first prove migration + contract + staging execution path without mutating production.

## Task Envelope minimum shape

```json
{
  "version": "wave.task.envelope.v1",
  "task_id": "waveenv_<hex>",
  "idempotency_key": "owner-scoped-idempotency-key",
  "title": "Owner task title",
  "instruction": "bounded task instruction, no secrets",
  "context": {
    "context_ref": "cp055/context/<id>",
    "context_revision": 1,
    "a2a_context_id": "optional",
    "context_sha256": "optional sha256"
  },
  "scope": {
    "environment": "staging",
    "target_zone": "TMN",
    "capability": "tmn.execute.readonly",
    "permission": "READ",
    "workspace_ref": "workspace:staging",
    "no_production": true
  },
  "authorization": {
    "owner_session": "owner-main/1LSS_OWNER_MAIN",
    "authority_ref": "ATHENA/YELLOW signed policy row or receipt",
    "signed_gate": "ATHENA_YELLOW",
    "signed_execution_required": true,
    "secret_material_in_payload": false
  },
  "execution": {
    "state": "TASK_IN",
    "executor": "TMN",
    "attempt": 0,
    "max_attempts": 1
  },
  "fallback": {
    "mode": "HOLD_FOR_OWNER",
    "allowed": false,
    "reason": "No broader permissions or production fallback without Owner evidence."
  }
}
```

## Work execution order

1. Checkout this branch on staging runner only.
2. Install dependencies normally; do not add paid APIs.
3. Run:
   - `npm run typecheck`
   - `npm run build`
   - `wrangler d1 migrations apply ogenic-phase-vi-staging --remote --preview false` only after confirming staging DB binding.
4. Read back D1 schema for `task_envelopes`, `task_envelope_events`, and `task_envelope_receipts`.
5. Add a staging-only API route or adapter that:
   - accepts `wave.task.envelope.v1`,
   - rejects secret-like payloads,
   - persists `TASK_IN_ACCEPTED`,
   - calls ATHENA/Yellow signed gate,
   - routes only to existing TMN/GH_ADDMIN_POVIDER lane,
   - stores `RESULT_OUT_RECEIVED`,
   - verifies result hash and writes `task_envelope_receipts`,
   - syncs LINCENC checkpoint only after independent readback.
6. Run GPT → WAVE → TMN → Result → D1 → LINCENC E2E and capture:
   - commit SHA,
   - workflow run ID,
   - task_id,
   - result_hash,
   - D1 readback rows,
   - LINCENC checkpoint row.

## Acceptance gate

`CP-055` becomes green only when a real staging `waveenv_*` task has `TASK_IN_ACCEPTED → ATHENA_YELLOW_AUTHORIZED → ROUTED_TO_TMN → RESULT_OUT_RECEIVED → RESULT_VERIFIED` in D1 and a LINCENC receipt.

`CP-056` becomes green only when Work verifies `lnwjud` dependency/package license compatibility, RAM/CPU footprint, and compatibility with D1/TMN, then either integrates the minimal compatible adapter or rejects it with evidence.

## Explicit non-goals

- Do not deploy production.
- Do not move or print secrets.
- Do not enable sudo or broaden host privileges.
- Do not add DeepSeek API.
- Do not create a permanent new agent/container.
- Do not mark PASS from source-only or CI-only evidence.
