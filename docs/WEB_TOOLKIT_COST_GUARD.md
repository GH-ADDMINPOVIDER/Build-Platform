# Web Toolkit — CCS Canonical Card and Zero-Paid-Spend Guard

## Canonical naming

The single front-door card is **Web Toolkit** (`web-toolkit`, CCS/1.0). These legacy names resolve to the same card: OGENIC God Toolkit, God Toolkit, Control Tower, Vercel Agent, and Vercel Sandbox. Do not create duplicate cards for the aliases.

The existing `OGENIC_GOD_TOOLKIT` MCP/tool namespace and `render_control_tower` function remain implementation identifiers for compatibility. They are not separate user-facing cards. `/api/ccs/resolve?name=Control%20Tower` resolves the alias; it does not execute actions. All `/api/ccs/*` routes retain Owner/Ops authentication.

## Vercel Agent and Sandbox status

- The previous Vercel Agent-generated Analytics change is not complete merely because a commit/deployment record exists.
- The current OGENIC harness does not expose a Vercel Agent invocation adapter; Vercel Agent paid chat, investigations, and code review are blocked from OGENIC routing.
- The Vercel Sandbox card remains disabled until its plan, included usage, network-egress treatment, private repository access path, and billing behavior have been independently verified.
- A Sandbox is an isolated execution environment, not the same as the Vercel Toolbar or Web Analytics. No Sandbox is automatically created by this policy.

## Cost guard

The CCS policy is `ZERO_PAID_SPEND`: max paid spend is USD 0; paid fallback is disabled; unknown cost/usage/billing and a missing meter adapter fail closed; the intended cutoff is at or before 80% of a measured included allowance. Paid use remains disabled until an enforcing invocation adapter can perform preflight against current usage before every operation.

The current policy is an OGENIC routing boundary. It **cannot intercept manual actions in the Vercel dashboard**. Do not approve a paid Vercel Agent plan, investigation, code review, or paid sandbox operation in that UI. Hobby-plan infrastructure limits do not automatically imply that Vercel Agent's AI-provider costs are free.

## Safety invariants

- No Production deployment/promotion or billing change.
- No credentials, cookies, passcodes, or raw tokens in card data, D1, or logs.
- No direct execution bypass; Yellow Stone remains the execution authority.
- Unknown aliases are rejected instead of guessing.
- Do not claim a free-tier cutoff is live-enforced until the cost/usage adapter is actually connected and tested.
