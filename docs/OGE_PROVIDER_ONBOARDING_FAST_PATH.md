# OGENIC / Unifiend — Direct-to-Work Agent Policy

**Default execution:** Unifiend / ATHENA → Yellow `/api/capabilities/execute` → agent adapter → Ruby → Green (verified results only).

There is **no mandatory onboarding request before each job**. Yellow is the single authority for capability resolution, auth and permitted execution. A user can send a supported job directly to Yellow. A legitimate resolver denial remains a denial; do not turn 404/409 into hidden provider retries.

**Optional diagnostics:** `GET /api/provider-readiness/onboarding` (owner/ops authenticated, read-only, no paid provider requests) reports known readiness and a suggested next action. Its `route_eligible` value is a **catalog/readiness hint, not proof the live Yellow resolver will accept the route**. The actual route is decided at execution; troubleshoot with `POST /api/capabilities/resolve` only when a route fails, not on every ordinary job.

**New provider fast path:** register provider + existing Infisical key → add one supported Yellow adapter → perform one explicitly authorized live proof when needed → start taking eligible work. Reuse shared context budget and evidence format. No new approval committee, duplicate D1 mapping, secret, memory store, CI workflow or recurring smoke test per agent.

**Always enforced at the action itself:** owner/ops auth; READ vs WRITE/EXECUTE/DANGEROUS permissions and required approval; bounded context; no hidden paid retry or paid auto-routing; secrets remain in Infisical; Ruby verifies before Green/1LSS retention. Current DeepSeek is explicitly selected metered READ; Gemini retains the existing READ lane. Unverified/billing-blocked candidates are not silently activated.

**If blocked:** return the exact resolver/provider failure and one next action instead of looping or creating another issue for the same root cause. Use the existing OGE issue until closure.
