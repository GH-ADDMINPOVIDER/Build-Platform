# STONE RUNNER — OGENIC Product #2: Behavioral Runtime Parity

**Canonical umbrella issue:** OGE-95. **Environment:** `phase-vi-provider-incentive-metering` staging only. **Owner concept:** near-1:1 independent self-host-compatible execution host with autonomous coding-capable agent execution *after* proven integration. **Product #1:** USE CARD / CCS, OGE-78/79. No new databases, secrets, production workers, or billable hosts.

## Distinguish product promises

- **Build & test Workerd Worker:** already operational via GitHub-hosted Ubuntu VM; same compiled Worker, local workerd/Miniflare and source SQL D1 migrations.
- **Operational behavioral 1:1:** target exact same inputs, known state, permissions, outputs, event ordering, errors, retries and deployment SHA **within a declared supported capability matrix**. Must record each scenario and exclusions. A local service can be contract-equivalent but need not duplicate Cloudflare's physical edge/data-center/latency or live provider internals.
- **General-purpose digital factory:** future ambition, not present fact. May generate code, websites, apps, other digital artifacts for toolchains provided on the host with requested model/provider adapters and authorized resources; no guarantee of 'anything' (physical output, unknown hardware, arbitrary cloud resource, closed-source provider internals).
- **'CPU-less'** means no *owner-owned* CPU/server, using temporarily borrowed cloud compute. It does **not** mean computation with no processor. GitHub Actions VMs have host CPUs. An emulated CPU (QEMU TCG, RISC-V soft-core, WASM interpretation) still runs on some CPU/GPU/FPGA or equivalent hardware; pure emulation does not create free additional compute. **Never add custom CPU emulation to workerd critical path** unless a concrete guest architecture requires it.

## Live components, non-claims

GitHub Actions: `.github/workflows/wave-replica-runner.yml` (visible Stone Runner), local Workerd + disposable D1.
Source: `scripts/replica-runner/prepare.mjs`, `verify.mjs`, `compare.mjs`, `athena-context.mjs`.
Current baseline: 364 Node tests, 12/12 local Workerd checks, 10/10 **public/unauthenticated** staging route contracts and across-run GitHub/Deploy Context Pack. Full runtime 1:1 **NOT CERTIFIED**.
New P0 expansion: `scripts/replica-runner/verify-1lss.mjs`, using a **random synthetic test credential** on local 127.0.0.1 only, verifies actual local D1 writes, 1LSS ordering, idempotent replay, cross-surface cursor, denied unauthorized access and secret-shaped-content rejection. It must pass CI before counting as covered.

## Existing dual-runner substrate and OGE-62 final-audit bottleneck (2026-10-08)

**Keep runtime and final verification distinct.** OGE-61's `runtime-01..10` are 10 isolated **GitHub-hosted jobs** with execution-profile labels (e.g. codex/claude); proof expressly recorded `provider_call_attempted=false`, so these labels are **not** 10 actual LLM agents running. OGE-62 then self-verifies per clone, marks `PROVISIONAL_DONE`, and performs a GitHub deterministic audit before `FINAL_DONE`, `commit_eligible` and Yellow authorization. Proof: [OGE-62 result](evidence/oge-62-flow-audit-latest.json), [GitHub Actions run 37452674382](https://github.com/Ogenicchocolate21debug/Build-Platform/actions/runs/37452674382). Retain this verified path; do not replace it with an LLM's unverified self-report.

**A second, real self-hosted executor already exists:** `wave-runner-01` (DigitalOcean Ubuntu, 1 vCPU / 1 GiB RAM, droplet recorded ACTIVE on 2026-10-08), independent of the ten GitHub-hosted matrix jobs. Existing integration: `worker/openai-selfhost-api.ts` (owner/ops `GET /api/openai/selfhost/readiness`; `POST /api/openai/selfhost/proof` requires `approved:true` and can create **metered** OpenAI Agents sessions), `.github/workflows/wave-openai-selfhost-executor.yml` (`runs-on: [self-hosted,linux,x64,wave]`, `codex exec-server`), and Yellow/OGE-28. **Historical live self-hosted OpenAI Agent execution WAS proved:** OGE-28 [GitHub Actions run 37194746215, attempt 5](https://github.com/Ogenicchocolate21debug/Build-Platform/actions/runs/37194746215) completed SUCCESS on 2026-10-04; the `connect wave-runner-01 to prepared OpenAI session` and `prepare and verify canonical self-host session` jobs both succeeded, publishing `oge28-executor-evidence-37194746215-5` and `oge28-proof-complete-37194746215-5` artifacts. The Linear OGE-28 closeout reports 1LSS evidence sequence 157. This is true bounded read-only end-to-end Agent→self-host executor proof; however, it does **not** prove an online executor on 2026-10-08 or actual independent semantic closing/commit/deploy. The DigitalOcean ACTIVE status alone is not readiness. Reuse and probe the existing route before provisioning OpenAI-hosted containers, further droplets or reimplementing an executor.

**One independent review lane to pair with GitHub:** choose a separate, bounded OpenAI Agents/Codex read-only verification session on the *existing* runner when authenticated environment connectivity is proven (or a hosted OpenAI sandbox under a separately authorized cost ceiling). Give it only GitHub CI provenance, exact source SHA, scoped sanitized diff and audit manifest; receive structured `PASS/FAIL/INCONCLUSIVE` + evidence references + model/session ID + usage. It **cannot** merge, commit, deploy or claim `FINAL_DONE`. Ruby reconciles that review with the mandatory deterministic OGE-62 GitHub audit; Yellow remains sole side-effect authority, Green remains canonical. `INCONCLUSIVE`, SHA mismatch or absent independent evidence => block final promotion, not auto-approve. Avoid using the same authoring agent/session to review its own patch.

**Required proof before promotion:** (a) fresh GitHub evidence; (b) owner-authorized readiness showing online registered executor and correct staging checkout (not only active droplet); (c) one bounded read-only OpenAI session output with session ID, SHA, usage and attached artifact; (d) Ruby reconciliation and an intentional, explicitly approved commit/deploy step, where applicable. Do not trigger the metered `/api/openai/selfhost/proof` endpoint without explicit user approval and existing Yellow limits. Do not run more than one heavy job on the 1 GiB host without resource measurement. DeepSeek is a model/reviewer through an existing execution host, not its own full shell sandbox in the current WAVE adapter; Manus is a possible alternative vendor execution platform but not a verified OGENIC final closer.

## 1:1 acceptance matrix (same exact SHA, test identity and fixture)

| Domain | Required proof | Current state |
|---|---|---|
| 1. Worker code & build | Canonical SHA, same entrypoint and asset manifest, build/TypeScript/tests pass | PROVEN locally on earlier SHA |
| 2. Public HTTP & UI | Same method/status/contract and relevant asset behavior, staging versus local | 10 selected cases matched; incomplete domain |
| 3. Auth/RBAC | Deny-by-default + authenticated owner/ops + approval binding; no secrets in artifacts | Unauthenticated denial covered; authenticated behavior pending |
| 4. Canonical 1LSS | **Real local D1** read/write, monotonic sequence, replay idempotency, multi-surface cursor, restart persistence | Local synthetic run in progress, not certified until passing |
| 5. Session recovery | Session ref uniqueness, cross-surface history paging, return-to-context and stale cursor | Static test exists; runtime fixture pending |
| 6. Use Card / CCS / Yellow | Scoped lease/use/return/revoke, authorization edge cases, no privileged bypass | Dedicated contract code/tests exist; full local runtime replay pending |
| 7. Multi-agent (Blue/Violet) | Provider eligibility, fanout/fanin, parallel task uniqueness and cancellations | Local simulator proof pending |
| 8. Model/remote adapters | Deterministic mock fixtures for failures/latency/rate-limit, auth+quota contracts; selected real *staging* probes only if already authorized | Real external-provider parity excluded today |
| 9. Persistence & restart | Local D1 retained across workerd reboot, retry safety and state reconstruction | Migration proof yes; warm restart still pending |
| 10. Deploy release fidelity | Exact commit tested = exact deployed staging commit, immutable evidence, rollback detection; no prod writes | Existing protected staging workflow; no full attestation yet |

**No blended '100%'** when critical domains 3-10 are unverified. Capture per-domain PASS / FAIL / BLOCKED / NOT_TESTED, exact SHA and evidence URLs. Full `ONE_TO_ONE_CERTIFIED` is only allowed when **all declared required domains** are PASS with an explicit compatible edge/external exclusions profile. If external provider/Cloudflare infrastructure is advertised as 1:1, those must be separately proven, not stubbed.

## Implementation lanes on existing OGE-95 (no duplicate task / DB)

1. **GitHub+ChatGPT lane** owns test harness and evidence only: finish P0 synthetic 1LSS proof; add workerd restart and session-ref fixture; broaden privacy-safe route comparison; produce machine-readable coverage matrix, not a single arbitrary percentage.
2. **Codex** is sole core code writer: consume Stone Runner `context_id` in existing Yellow/ATHENA; scoped delegation, authenticated task envelopes, deterministic idem key, Codex patch/PR, independent verification and limits; avoid touching GitHub test harness files at same time.
3. **Blue/Violet** chooses and parallelizes eligible specialists for distinct non-overlapping tasks; **Yellow** is sole operation/credential authority, guided by the existing single **Rule Stone** policy source `config/oge95-rules-center.json`.
4. **Ruby** checks exact SHA + CI/artifact + side-effect receipts; **Green/1LSS** retains a canonical verified summary (never duplicate source-of-truth or raw provider secrets).
5. **Codex environment blocker**: latest agent's report showed checkout on unrelated `work` branch and GitHub HTTP 403, so no successful autonomous repo patch can be credited to delegated Codex until proper checkout/connector access is restored. GitHub connector changes are a separate, verifiable execution surface.

## Shipping

- **Product #1:** Capability Card Stone protocol (OGE-78/79), labeled Done on Linear, separate CI regression must be healthy.
- **Product #2:** Stone Runner — Stage A evidence/runtime simulator confirmed; Stage B autonomous coding/dispatch pending; Stage C reproducible 1:1 capability-profile parity pending.
- Packaging to self-host Docker/CLI and scaling with hosted CPU pools is a **future distribution decision**; no new paid infrastructure or physical CPU required from owner today.
- Keep `main`, production, Candy, remote D1 schema, Infisical secrets and unapproved billing unchanged.
