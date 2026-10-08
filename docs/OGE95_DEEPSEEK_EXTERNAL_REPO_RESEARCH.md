# OGE-95 — DeepSeek Dual-Source Research

Research proof: https://github.com/Ogenicchocolate21debug/Build-Platform/actions/runs/37753896768

- GitHub-hosted Runner fetched **5 official external pages live** and read **7 repository files** at commit 3f236c6b159642ba0cb03efce391aa547131ead6.
- Existing Yellow Stone selected deepseek/context_load for one call, HTTP 200 with 1,959 total reported tokens. No retries, fallback or direct provider network from GitHub. Model did **not** browse itself: sourced evidence was retrieved for it.
- Input 5,589 prompt characters; existing Yellow max output tokens 256. The model answer ended mid-first recommendation.
- Factory initially rejected the cited official Playwright URL due to missing allowlist entry, not due to provider failure. The exact playwright.dev official domain was added to accepted documentation sources.
- The original artifact was replayed WITHOUT a second model call, passed factory intake (7/7 tests), RECEIVED_UNVERIFIED / EVIDENCE_READY. Ruby still pending, Green retention blocked. Intake proof: https://github.com/Ogenicchocolate21debug/Build-Platform/actions/runs/37754234950
- Baseline Replica remains 348/348 tests, 12/12 local checks, 10/10 SELECTED public routes; **not** whole-system 1:1: https://github.com/Ogenicchocolate21debug/Build-Platform/actions/runs/37749673030

## Official outside evidence

- EXT1 https://developers.cloudflare.com/workers/testing/test-harness/get-started/ — createTestHarness integration testing for Worker bundles.
- EXT2 https://developers.cloudflare.com/workers/testing/test-harness/integrations/ — mock outbound fetch through MSW.
- EXT3 https://developers.cloudflare.com/d1/best-practices/local-development/ — isolated LOCAL D1 migrations and persistence.
- EXT4 https://docs.github.com/en/actions/reference/runners/self-hosted-runners — ephemeral runner lifecycle and one-job isolation.
- EXT5 https://playwright.dev/docs/browsers — WebKit and mobile device emulation; not the exact released iPhone Safari.

## Exact repo sources read

- REPO1 scripts/replica-runner/verify.mjs — local contract proof.
- REPO2 scripts/replica-runner/compare.mjs — ten anonymous/public route contracts.
- REPO3 worker/knowledge-refinery.ts — existing factory stages.
- REPO4 worker/capability-execution-api.ts — Yellow DeepSeek explicit READ, 256 output tokens.
- REPO5 database/migrations/0010_1lss_canonical_line.sql — sequence/idempotency/surface constraints.
- REPO6 .github/workflows/wave-replica-runner.yml — isolated build/D1/deploy handoff.
- REPO7 scripts/replica-runner/factory-core.mjs — bounded work order, Ruby hold.

## DeepSeek's actual, partial finding

The model ranked **synthetic deterministic 1LSS fixture** as the next P0. The migration defines sequence_no, idempotency_key, and source_surface but there is no proof of seeded local owner session replay. DeepSeek proposed a LOCAL-only fixture file at scripts/replica-runner/seed-1lss.mjs and extending the parity tests to check monotonic ordering, gap-free sequences, duplicate deduplication and cross-surface consistency. This is a model proposal, not implemented or Ruby-verified. Its reply stopped mid-sentence due to the bounded output.

## Other recommended steps, independently grounded in external docs (NOT DeepSeek's complete answer)

1. P0: Use purely synthetic data and LOCAL D1 (never the remote canonical owner-main) to reproduce two-surface 1LSS replay and idempotency.
2. P0: Add Cloudflare createTestHarness integration tests, mock external provider 200/401/429/timeout via MSW, verify Yellow reject and Ruby hold independently.
3. P1: Test mobile composer/chat reconnect with Playwright WebKit and iPhone emulation; validate real Safari separately.
4. P1: Extend to 20 weighted critical scenarios and publish parity matched ratio plus measured coverage, with 100% of critical authorization/1LSS invariants required. Selected anonymous 10/10 is not whole-system 1:1.

## Status

Research delivery COMPLETED, factory intake EVIDENCE_READY, semantic Ruby verification PENDING, Green RETAIN blocked, no deploy. Existing cost/context rules permit authorized metered research; no new gates/database, no main/prod/Candy/remote D1 schema changes.