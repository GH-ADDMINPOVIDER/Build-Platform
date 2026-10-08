# OGE-95 Stone Runner — GitHub/Deploy-aware future execution agent

Status: **Stage A execution-context proof + passive final-stage learning cache implemented**, not yet an autonomous LLM/tool-calling or code-writing Agent. Keep Stone Runner at its original post-Runtime ×10 evidence-fan-in position while evolving Product #2.

## Scope: execution machine, not the coding model

**Stone Runner currently does NOT autonomously write, edit, commit or deploy code.** It builds, tests and emulates the checked-out Worker and stores restartable GitHub/CI/deploy context. A future coding lane can let **Codex or other authorized coding models propose patches**, then execute tests in an ephemeral sandbox, pass evidence to Ruby, and submit changes through existing scoped GitHub permissions. The coding model is the reasoning engine; Stone Runner is the execution and evidence engine.

**Compatibility rule:** Existing paths, JSON schema `OGE95_ATHENA_RUNNER_CONTEXT_V1`, machine output strings, and artifact prefix `wave-athena-context-` remain stable until a versioned migration; those names are internal legacy keys, NOT the product brand.

## Context memory from real evidence (not a second D1)

On every Stone Runner (legacy workflow file: `wave-replica-runner.yml`) CI run:

1. Checkout the exact `phase-vi-provider-incentive-metering` SHA, with limited commit history.
2. Fetch the latest GitHub Actions run statuses for this branch using the temporary GitHub Actions token (`actions:read` through existing workflow access).
3. Identify current canonical CI, staging deploy source SHA, observed failures, and ephemeral Replica workerd+D1 evidence.
4. Recover the newest `wave-athena-context-<run_id>` artifact, if available. Carry over only historical evidence receipts, **not permissions or claims about live readiness**.
5. Deduplicate by workflow + commit SHA + conclusion, keep the exact run evidence URL; emit `athena-runner-context.json`.
6. Publish context as a new GitHub Actions artifact for 30 days. On expiration or first execution, the cache reconstructs itself from canonical GitHub history.

The legacy-named `athena-runner-context.json` machine-readable receipt contains:
- `source_sha`, `context_id`, `run_id`, `git.commits` + file fingerprints
- `actions.latest_staging_deploy`, `actions.latest_canonical_check`, `actions.latest_failure`, `actions.recent_runs`
- `local_runtime` current-SHA local proof + *only public/unauthenticated* parity ratio
- `suggested_actions` with `authority` and `auto_execute:false`
- `historical_receipts` deduped and carried forward from previous artifact
- `canonical.state_owner = CLOUDFLARE_D1` and `canonical.executor_authority = YELLOW_STONE`

No raw logs, credentials, cookies, D1 content, or new memory tables are saved. Cloudflare deploy success is inferred *only* from the matching GitHub deploy-workflow evidence, **not** as proof of real production Cloudflare state. Any runtime state must be probed separately.

## Stone Runner stays in the final stage and accumulates lessons
**Owner decision:** keep Stone Runner attached to `Runtime ×10 -> GitHub Audit + independent Manus/OpenAI reviews -> Stone Runner evidence learning -> Ruby -> Yellow -> Green/1LSS`. The three upstream roles are GitHub deterministic audit, Manus optional preferred reviewer, and OpenAI/Codex optional independent reviewer; neither Manus nor OpenAI final review is proven live for OGE-95 today.

The read-only `scripts/oge95-stone-runner-learning.mjs` produces `OGE95_STONE_RUNNER_LEARNING_V1` from `OGE95_FINAL_REVIEW_INTAKE_V1`. It remembers only a bounded digest of 3-lane status and SHA-aligned evidence, with sanitized deduplication and unverified learning candidates. `.github/workflows/oge-95-final-review-intake.yml` attempts to recover the previous snapshot and publishes an updated 30-day artifact. This is an **evidence cache**, not continuous autonomous job execution and not model training. An absent reviewer remains `NOT_CONNECTED`. No direct provider API calls, write authority, secret values or new canonical DB are part of this learning step. Verified lessons must be Ruby-checked before Yellow-authorized Green/1LSS promotion using the existing route.

## How Stone Runner becomes a coding-and-deployment agent

**Now (Stage A — operational):** deterministic "observe -> remember evidence -> suggest" works on a real independent GitHub-hosted VM. It already runs the source build, boots the same Worker through workerd, applies local D1 migrations, runs local API/Chat/UI checks and compares selected public staging routes. No AI model tokens used for context generation.

**Next (Stage B — not yet implemented, Codex core lane):** Yellow receives `context_id` + current SHA + objective and chooses eligible provider/command. A job envelope uses stable idempotency keys and pre-authorized permissions. The ephemeral Runner executes the selected scoped operation, then emits an evidence artifact.

**Later (Stage C — not yet implemented):** Ruby checks the exact SHA/CI/runtime/evidence and the selected behavioral case. Green/1LSS stores only verified summary plus artifact reference through the existing canonical path. Real Cloudflare/n8n/third-party write/deploy requires existing Yellow permission and the protected staging workflow, not the Replica VM.

## Collaboration contract: no file collisions

- GitHub + ChatGPT lane: `scripts/replica-runner/athena-context.mjs`, `tests/oge95-athena-runner-context.test.mjs`, `.github/workflows/wave-replica-runner.yml` and this document.
- Codex: application/Yellow/Ruby factory execution interfaces, `config/oge95-rules-center.json`, other tests and runtime consumers. Read current branch HEAD before writing.
- Manus: owner-preferred independent review evidence provider, **not yet integrated as real OGE-95 reviewer**; OpenAI/Codex: alternate reviewer with OGE-28 historical self-host proof, but no current final-audit proof. Gemini/DeepSeek: independent READ analysis when required.
- OGE-95 is the single parent issue. Never open duplicate issue(s) or create a second D1 state.

## Proof and interpretation

A green Runner job certifies that **its exact SHA** passed its local workload. Public 10/10 routing parity does not certify full 1:1 (owner-authenticated 1LSS, external API, real Cloudflare edge, mobile Safari). Future autonomy is tracked separately from evidence cache and may not be presented as already implemented.

Source: `scripts/replica-runner/athena-context.mjs`, `.github/workflows/wave-replica-runner.yml`, `tests/oge95-athena-runner-context.test.mjs`.
