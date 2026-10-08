# OGENIC / WAVE — Provider onboarding fast path

Register → Bind existing Infisical key → Verify runtime once → Enable an implemented, approved route.

Read-only owner-authenticated diagnostic: `GET /api/provider-readiness/onboarding`. It uses local staging attestations and performs zero paid model calls. Follow the returned `next_action`; never infer readiness from key presence alone.

- `SET_UP_SECRET`: missing credential; check existing binding/aliases, do not duplicate keys.
- `VERIFY_RUNTIME_ONCE`: runtime/API/quota/billing evidence missing; request approval before any paid smoke, then capture canonical CI evidence.
- `RECONCILE_CATALOG`: verified provider exists but its canonical registration isn't active.
- `IMPLEMENT_ADAPTER`: verified provider still needs an explicit supported Yellow adapter with contract tests.
- `READY_EXPLICIT_ONLY` / `READY_AUTO_READ`: only the current approved READ adapter is eligible; DeepSeek remains explicit/limited and Gemini retains its existing read routing.

These checks are shared, not rewritten for each agent. WRITE/EXECUTE/DANGEROUS still require owner approval, Ruby verifies before Green/1LSS retention, and unavailable/disabled capabilities remain blocked. No hidden retries, unapproved paid auto-routing, secrets in D1, production changes, or second memory store.

For a new specialist, extend the registry and implement/test its adapter, record a genuine one-pass proof, then confirm the non-billable readiness endpoint. Do not activate Perplexity, Claude, xAI, Meta or other candidates from key presence alone.
