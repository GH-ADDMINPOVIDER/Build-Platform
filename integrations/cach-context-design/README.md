# CaCH Context Design — TMN Source Intake (staging)

**Exact target repository requested:** `Wave-Runner-2/CaCH-Context-Design` (not yet created).
**Verified Store source:** https://github.com/Ogenicchocolate21debug/CaCH-Context-
**Source commit pinned:** `09c434ab73ca43761c5d8b0c5d341926c2fba710`
**Source package identity:** `@dietrichgebert/ponytail` v5.3.2, upstream author Dietrich Gebert, MIT.
**Current GH2 location:** staging intake manifest only; **NOT** a full repository mirror or installed runtime plugin.

## Boundaries
- `RP_STORE(OLD)` / GH1: read-only recovery source; do not rewrite history, source, tag, or private proof.
- `GH_ADDMIN_POVIDER` / GH2: primary account for implementation and pull requests.
- `TMN` is an execution task network: Terminal SOLO (SSH + IDEs + OPC + CODEX-TMN) → Docker → OCIAN-S HOST.
- ATHENA / Yellowstone controls Owner authorization, scope and Run ID; Ruby validates; Greenstone / D1 stores receipts.
- Import source only after preserving MIT LICENSE and original attribution, reviewing agent hook behavior, testing in an isolated **unprivileged** Docker container, and pinning the source commit.
- Do **not** execute downloaded plugin hooks on the owner/runner host or mount Docker socket/SSH/Infisical into the container.

## Canonical operation acceptance (still OPEN)
1. Create the separate target repository under GH2 (current GitHub connector exposes no `create_repository` action).
2. Mirror the full Git history of the source into it using an independently authenticated GH2 Git client, preserving origin and legal attribution.
3. Validate installed dependencies, agent hooks, node permissions and Docker test logs on an isolated staging SHA.
4. Register explicit adapter ID in existing TMN registry, link to WAVE/D1 Run ID, and record input → execution → result → readback.
5. Only promote an individual verification label after actual E2E receipt; keep historical Green/Orange intact.

This file records a **source pointer and migration gate** only. No OAuth/secret or staging/production deploy authorization is implied.
