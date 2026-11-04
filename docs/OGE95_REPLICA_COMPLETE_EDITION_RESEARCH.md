# OGE-95 — Replica Runner Complete Edition (research-grounded design)

**Status 2026-10-08:** Architecture proposal grounded in public official Cloudflare/GitHub docs, reviewed independently by ChatGPT; **NOT a DeepSeek-generated design**. Requested two bounded DeepSeek research calls failed with `TRANSPORT_EXCEPTION` before an answer, first on `wave-runner-01`, then on `ubuntu-latest`: [run 37750727488](https://github.com/Ogenicchocolate21debug/Build-Platform/actions/runs/37750727488) and [run 37751036543](https://github.com/Ogenicchocolate21debug/Build-Platform/actions/runs/37751036543). Do not claim the model completed review or quote hallucinated DeepSeek recommendations. No further paid retry without a new conscious decision; provider charges for failed requests are unknown.

## Existing verified base

- Local parity proof [run 37749673030](https://github.com/Ogenicchocolate21debug/Build-Platform/actions/runs/37749673030) SUCCESS: 348/348 tests, 12/12 local checks, 15 local D1 migrations, 10/10 **chosen public/unauthenticated route** contracts match staging.
- GitHub-hosted ephemeral Ubuntu runs Node 22, package build and the same compiled Worker bundle through `wrangler dev --local`; isolated local D1 only. Evidence `replica-evidence.json`.
- Canonical staging deploy stays in `.github/workflows/provider-incentive-staging-deploy.yml` on `wave-runner-01`. Replica deploy handoff needs explicit `workflow_dispatch` with `deploy_staging=true` and same-HEAD proof; it has **not** been exercised by this research.
- **Important:** 10/10 chosen surface contracts is *not* certified 90% whole-system operational parity.

## What would make the replica genuinely close to the real Unifiend?

| Priority | Missing feature | Smallest useful implementation | Verification |
| --- | --- | --- | --- |
| P0 | Stateful owner-main / 1LSS | Build a synthetic, deterministic local D1 seed and two independent session clients. Use real API contracts and prove ordered sequence, idempotency, no cross-session bleed. Never import real owner data. | Deterministic repeated run: exact event/sequence invariants; zero remote writes |
| P0 | Agent execution without privileged bypass | A bounded GitHub Actions job accepts a small validated **task ID and an allowlisted action**, not arbitrary shell commands or uploaded code. Yellow chooses allowed READ/TEST task and sees the GitHub run; Ruby grades the proof; Green retains verified event only through existing path. | Secret-less disposable job; deadline, size, network policy, CPU/memory limits, artifacts; malicious input rejected |
| P0 | Provider/binding differences | Use official Cloudflare Workers Vitest integration or `createTestHarness()` to mock outbound models/GitHub/n8n and simulated D1. Validate 200/401/403/404/409/503 and the structured error code separately. | Never call a paid model; deliberately disabled capability stays fail-closed; non-READ cannot skip Yellow |
| P1 | Browser/mobile fidelity | Playwright WebKit/Chromium on GitHub-hosted VM for composer, chat streaming, reconnect, responsive layout and keyboard; real iPhone Safari remains separate final proof. | Screenshots + assertions, not screenshots alone |
| P1 | Reproducible toolchain | Explicitly pin Node, Wrangler and dependencies; hash build + source + fixtures; record model/binding mock versions in evidence. | Identical commits yield deterministic route/contract results across repeated ephemeral VM runs |
| P1 | Safe deploy and rollback | Separate Replica `contents:read` execution from a narrowly authorized deployment-dispatch job; use current staging-only deploy workflow, verify changed SHA and runtime health, and retain rollback info. | A deliberately requested staging deployment succeeds with proof; no Replica job has production secrets |

## Proposed complete architecture

```text
Unifiend / ATHENA  ->  YELLOW / MA-OP (one execution authority)
   |
   +-> OGE-95 task envelope (task_id, allowed_operation, source_sha,
   |                         max_wall_clock, idempotency_key, approval_state)
   |
   +-> GitHub-hosted ephemeral VM (no provider secrets, no user D1)
       -> exact checkout + build -> isolated workerd + synthetic D1
       -> test fixture/replay -> mock outbound providers -> web/mobile tests
       -> signed/hash-addressed evidence artifact -> GitHub run ID
   |
   +-> RUBY independent verification of actual test/evidence
       -> GREEN / 1LSS only if passed, through existing canonical API
   |
   +-> optional operator-selected staging deploy via existing wave-runner-01
       -> staging health/behavioral smoke -> evidence -> Ruby
```

Do not place more runners on the existing 1-vCPU/1-GB DigitalOcean host. Do not create another memory DB, policy gate, secret store, or Linear subissue.

## Parity score — do not game the 0.9 target

Use **20 fixed test scenarios** split by business-critical classes, each re-run with identical normalized inputs against local replica and verified staging when safe. Record exact source SHA, route, status, response schema, authorization decision, D1 invariants, and bounded latency where practical. Proposed distribution:

- 4 UI/auth edge scenarios (anonymous, owner, role denial, mobile screen flow).
- 5 owner-main/1LSS state invariants (monotonic sequence, cursor reconnect, duplicate idempotency, cross-surface replay, session isolation) with **synthetic local** data; compare staging only with a permitted non-mutating equivalent.
- 4 Yellow/ATHENA capability and error contracts (READ, unsupported, disabled, non-READ approval) without turning on a capability to force a 409.
- 3 provider/n8n integration simulations (timeout, quota error, fallback blocked) tested locally with *mock* responses and with no billable requests.
- 2 Ruby evidence/retention scenarios (reject forged evidence, retain verified event).
- 2 deployment lifecycle scenarios (artifact SHA handoff + operator-selected staging-only deploy, no production change).

A conservative metric is `matched_weight / eligible_weight` only for comparable, tested scenarios; report coverage separately. For a credible target require >=0.90 scored matches **and** 100% pass on critical auth/1LSS/Yellow approval invariants; otherwise `UNVERIFIED`. Do not count mocked provider responses as genuine provider/runtime availability. A 10/10 public route match should remain under `surface_parity`, not `whole_system_parity`.

## P0 implementation sequence

1. Add `scripts/replica-runner/fixtures.mjs`: deterministic synthetic D1 data generator and local-only session replay; existing SQL migrations already run. Never copy remote D1.
2. Add `tests/replica-agent-envelopes.test.mjs` and a minimal GitHub-hosted job dispatch contract validating task_id, source_sha, allowed operation, max duration and proof idempotency; least-privilege default `contents:read`.
3. Add Cloudflare workerd integration tests with mocked provider fetch calls and D1; extend current compare report without falsely equating mock success to provider availability.
4. Only after P0 is proven: authenticated read-only staging comparisons using the existing owner-auth mechanism, without storing cookies or provider keys in a GitHub artifact.
5. One deliberate staging-only deploy proof (no automatic dispatch); after it passes, Ruby closes OGE-95 with evidence.

## Official source references

- Cloudflare Workers local execution/bindings: https://developers.cloudflare.com/workers/local-development/
- Cloudflare D1 isolation/migrations: https://developers.cloudflare.com/d1/best-practices/local-development/
- Binding differences per environment: https://developers.cloudflare.com/workers/local-development/bindings-per-env/
- Workers test harness and Vitest: https://developers.cloudflare.com/workers/testing/
- GitHub ephemeral runners and autoscaling: https://docs.github.com/en/actions/reference/runners/self-hosted-runners
- GitHub workflow security: https://docs.github.com/en/actions/reference/security/secure-use

**Research limitation:** Complete code execution, provider fidelity, safe authenticated comparison and actual deployment are still pending. Neither this document nor the failed DeepSeek calls certifies a complete replica.
