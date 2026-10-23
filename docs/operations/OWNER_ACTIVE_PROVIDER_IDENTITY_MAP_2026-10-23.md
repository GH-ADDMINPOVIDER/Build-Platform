# OWNER — SINGLE ACTIVE GH-2 PROVIDER / FROZEN ALIASES (2026-10-23)

**Canonical human-facing names from Owner directive:**

| Visible label | Role | Technical locator (unchanged) |
|---|---|---|
| `GH-2 Addmin Provider` | **Only active GitHub Provider** | GitHub account `Wave-Runner-2`, repo `Wave-Runner-2/Build-Platform` |
| `store` | Historical read-only archive/fallback, **never command executor** | GitHub account `Ogenicchocolate21debug`, repo `Ogenicchocolate21debug/Build-Platform` |
| `OCIAN-S-Host` | Only original DigitalOcean physical machine | Droplet `604432491` |
| `Codex S-Host` | Codex runtime **on OCIAN-S-Host** | Linux profile `/home/wave/.codex` |

**Frozen legacy display names:** `wave runner`, `wave runner-1`, `wave runner-2`, `GH-1`, `GH-runner-1` plus historical labels `GH_ADDMIN_POVIDER` and `RP_STORE(OLD)`. They may be quoted when auditing historical proof, but they must not be advertised as current owner-defined operating roles.

**Critical distinction:** `Wave-Runner-2` is still the **real GitHub account ID** needed in REST URLs and repository paths; `wave-runner-01` is the registered GitHub Actions runner **service name**, not another Provider or physical host. `OCIAN-S-Host` is the DigitalOcean machine. `Codex S-Host` executes on OCIAN. Blindly replacing real GitHub owner/runner service strings would break dispatch. If Owner later requests renaming underlying technical IDs, use a separate verified host migration with explicit readback.

## One live execution lane

`GS command → authenticated WAVE → ATHENA/Yellow signed scope → GH-2 Addmin Provider → GH2 GitHub Actions → existing OCIAN-S-Host runner → local Codex S-Host → Cloudflare D1 result/readback`.

`store` is accessible **only** as historical exact-SHA fallback; no routine dispatch, write, deploy, runner registration, command or secret reuse.

## Implementation and preservation

1. Store human-facing labels in `config/owner-runtime-labels.json`. Active provider count must remain one.
2. Preserve historical CERT/Run/Job/SHA, checkpoints and GREEN/PASS-E2E as immutable. Owner five-color policy effective 2026-10-23 08:36 Asia/Bangkok remains separate; don't backdate alias rename.
3. Existing GH2 staging Draft PR #10 fixes routing away from old GitHub repo; do not merge/deploy this policy as proof of executed runtime.
4. Do **not** alter already-registered GitHub account owner, Actions runner name, hostname, workspace directory, Cloudflare secrets, D1 bindings or old certified operations.
5. New E2E proof requires real GH2 runner acceptance and signed task/result/D1 readback; `QUEUED` does not prove runner failure.

## Scope and verified state

Only staged source/policy updated, no provider service disabled or registered runner renamed. Historical account mappings retained as forensic references only.
