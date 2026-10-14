# CCS Authority Contract

- Child/effective authority cannot exceed parent provider, capability, permission, environment, expiry or egress scope.
- Revocation is lineage-aware and cached references fail closed after ancestor revocation.
- Invocation authorization is independent from discovery.
- Egress is checked against normalized allowed origins.
- Public authority metadata excludes credential-bearing fields.
- Runtime credential custody remains brokered; references must use `vault://` or `binding://` forms.
- No hidden cross-provider fallback.

The current live CCS surface remains a bounded/read-oriented control facade. Future side-effecting adapters must call the invocation authorization boundary before provider execution.


## Canonical Web Toolkit card

- The single public-facing CCS front door is `web-toolkit`, displayed as **Web Toolkit**.
- `OGENIC God Toolkit`, `God Toolkit`, and `Control Tower` are legacy aliases to that same card; do not create a second user-facing card.
- The existing `OGENIC_GOD_TOOLKIT` and `render_control_tower` tool names stay as compatibility implementation IDs only.
- The alias resolver is read-only and does not execute a provider action. Unknown names fail closed.
- The card contains the Vercel Agent and Vercel Sandbox components, but the current OGENIC harness does not expose paid Vercel Agent execution and does not provision a sandbox.

## Zero-paid-spend policy

- Maximum paid spend through the Web Toolkit is USD 0; paid fallback is false.
- Unknown usage, cost, billing mode, or missing preflight meter blocks an OGENIC-routed operation.
- The intended free-allowance cutoff is at or before 80%, provided a live meter and admission adapter are available.
- This CCS boundary cannot intercept actions the owner manually initiates in the Vercel dashboard. Never claim it does.
- The current live CCS surface remains a bounded/read-oriented control facade. Future side-effecting adapters must call invocation authorization and cost preflight before provider execution.
