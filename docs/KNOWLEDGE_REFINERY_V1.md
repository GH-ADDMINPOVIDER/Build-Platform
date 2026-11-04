# Unifiend Knowledge Refinery v1

## Purpose

Turn external research and debugging experience into verified, reusable Unifiend knowledge without creating a second memory system.

Canonical lifecycle:

`SOURCE → DISTILL → REPRODUCE → FIX → SPECIALIST_REVIEW? → VERIFY → RETAIN`

## Roles

- **DeepSeek • Agent • Chief Reasoning Officer** — research/code intelligence; source synthesis; debug-pattern distillation.
- **Docker • Worker • Sandbox** — isolated reproduction and testing. Docker is a worker/runtime, not an Agent.
- **Codex • Agent • CTO** — primary code-fix Agent.
- **Cursor • Agent • Build Director** — expensive/on-demand specialist for low-confidence, repeated-failure, large cross-file debugging.
- **Ruby Stone** — evidence-backed verification gate.
- **Violet Stone** — orchestration, handoff, lifecycle and performance statistics.
- **Green Stone / 1LSS** — canonical retained knowledge/state only after verification.
- **Yellow Stone** — execution/policy/approval authority for side effects.

## Idle research

Idle research is allowed only when the work queue is empty, the source is allowed, and budget authorization exists. It is READ-only. No provider call or paid research job should be launched merely because the system is idle.

## Knowledge classes

1. **Research evidence** — source references and observations; not canonical truth.
2. **Distilled knowledge** — concise problem/symptom/cause/fix/constraints with provenance.
3. **Verified knowledge** — Ruby has a fresh evidence reference proving the result.
4. **Retained knowledge** — verified/high-value distilled knowledge promoted into Green/1LSS continuity.

## Repository/source policy

- First-party or owner-authorized sources may use full context.
- Public third-party sources default to `DISTILL_ONLY`.
- Reuse of third-party code requires explicit rights/permission compatible with that reuse.
- Unknown or unauthorized sources are rejected.
- Keep provenance and license/permission metadata.
- Do not bulk-copy third-party repositories into Green memory; retain patterns, facts, decisions and verified fixes.

## Escalation to Cursor

Cursor stays `ON_DEMAND` and is selected when any deterministic trigger fires:

- confidence < 0.65;
- repeated failed attempts >= 2; or
- cross-file impact >= 8 files.

This keeps recurring cost down while preserving a hard-debug specialist path.

## Docker sandbox

The proof image runs with:

- `--network=none`
- `--read-only`
- `--cap-drop=ALL`
- `--security-opt=no-new-privileges`

This validates Docker as an isolated Worker/Runtime rather than a conversational Agent.

## Governance

No new D1 schema. No raw credentials/tokens/cookies in retained knowledge. No main, production or Candy changes. Existing Green/Yellow/Blue/Violet/Ruby authority boundaries remain intact.
