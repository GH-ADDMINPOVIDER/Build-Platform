# OGENIC Product #2 — STONE RUNNER

**Product status:** FUTURE BUILD / PRODUCT BACKLOG — prototype and historical proofs preserved, **NOT** shipped, NOT certified runtime 1:1.  
**Snapshot date:** 2026-10-08  
**Current umbrella issue:** [OGE-95](https://linear.app/ogenic-sio/issue/OGE-95/stone-runner-product-2-ephemeral-compute-factory-runtime-parity-11) (still **In Progress** until independently verified; never label Done based only on this snapshot).  
**Repo/branch:** `Ogenicchocolate21debug/Build-Platform` / `phase-vi-provider-incentive-metering`.

## Immutable identity
- Product display name: **STONE RUNNER** (#06).
- Stone material/color: **Obsidian Black**, hex `#111113`.
- Capability: `EPHEMERAL_RUNTIME_EXECUTION`.
- Separate **RULE STONE** (#07, Gray Agate, `CENTRAL_RULE_TAXONOMY`). Rule Stone is an existing centralized configuration/taxonomy, not the runner and not a second Yellow permission gateway.
- Canonical names/colors/capabilities: [OGENIC_STONES_CANONICAL.md](../OGENIC_STONES_CANONICAL.md).

## Existing, KEEP, do not rebuild
1. **Runtime ×10** (OGE-61): ten parallel GitHub-hosted isolated *job clones*, not ten persistent independent machines nor ten real AI inference sessions. All self-verify into `PROVISIONAL_DONE`; no direct canonical write.
2. **GitHub deterministic closing audit** (OGE-62): 10/10 result audit, integrity/digest and scope checks, then existing Yellow commit gate for `FINAL_DONE`. Historical audit result: [audit evidence](../evidence/oge-62-flow-audit-latest.json). That historical manifest **does not** contain a source SHA and must not certify a later commit.
3. **Existing self-host executor**: `wave-runner-01` (DigitalOcean), and [OGE-28 run 37194746215](https://github.com/Ogenicchocolate21debug/Build-Platform/actions/runs/37194746215), where OpenAI Agents `codex exec-server` connected successfully for a bounded READ-only proof; this is not a certified OGE-95 code-writing/deploying or current live-availability proof.
4. **Stage A Stone Runner**: [implementation and limits](../../infra/replica-runner/STONE_RUNNER.md) and [parity matrix](../OGE95_STONE_RUNNER_PRODUCT2_PARITY.md). Local workerd/D1/1LSS evidence is real, but full 1:1 behavioral parity is **not** certified.
5. **New optional final-review intake (code staged, runtime still unverified):** [normalizer](../../scripts/oge95-final-review-intake.mjs), [Manus/OpenAI no-task readiness probes](../../scripts/oge95-provider-readiness.mjs), and [GitHub Actions verification workflow](../../.github/workflows/oge-95-final-review-intake.yml). No independent Manus/OpenAI reviewer PASS receipts or confirmed successful latest CI run at snapshot.

## Target product after future authorization
- `ATHENA/VIOLET -> Runtime ×10 -> self-verified provisional results -> GitHub audit -> optional independent Manus reviewer and/or OpenAI/Codex reviewer -> Ruby evidence adjudication -> Yellow authorized commit/deploy -> Green 1LSS verified summary`.
- **Three runner roles are choices, not three automatically online machines:** (1) GitHub audit REQUIRED and proven historically, (2) Manus FIRST CHOICE but reviewer task and free credit readiness NOT proven, (3) OpenAI/Codex optionally on existing self-host, with a historical shell-session proof only. DeepSeek is currently a reasoning/research/reviewer model in existing adapters, not a standalone shell execution host.
- Later develop a reusable ephemeral Golden Runner image/template to clone and run bounded coding/build/test tasks. Every clone must verify canonical staging branch and exact SHA, respect file-scope ownership and existing Yellow permissions, leave D1 authoritative, and produce independent Ruby-checkable evidence before FINAL_DONE.
- Never require a third-party paid agent for ordinary existing deterministic GitHub PASS. Manus Free credits have limits and may not be available through API; require verified entitlement and explicit cost guard before actual provider call.
- Never make unverified AI self-review equivalent to Ruby evidence; prevent conflicting or forged SHA receipts and false claims that a deployment occurred.
- Product release acceptance: [10-domain actual behavioral parity matrix](../OGE95_STONE_RUNNER_PRODUCT2_PARITY.md), live provider review provenance and resource usage, independent Ruby checks, same SHA build/test/staging proof, gated releases.

## Future restart checklist
1. Reconcile newest staging HEAD, CI and self-host online status. No checkout assumptions (Codex `work`/403 problem must not recur).
2. Independently verify provider connection without creating paid sessions; budget-check any Manus/OpenAI reviewer task.
3. Fix missing SHA binding in historical audit contract and prove exact SHA over ten runtime results.
4. Run real bounded independent review, verify receipt, compare to GitHub deterministic audit; authorize only permitted staging-side effects.
5. Keep `main`, production, Candy, remote D1 schema, credentials and paid provisioning untouched until separately approved.

**Product archive is not OGE-95 acceptance completion.** Do not flip OGE-95 to Done unless acceptance tests and run evidence satisfy the stated criteria. If development is deferred, close administratively as Canceled/Deferred with explicit notice, not Done.
