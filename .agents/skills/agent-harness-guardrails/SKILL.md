---
name: agent-harness-guardrails
description: Keep multi-agent work bounded by existing OGENIC authority, adapters, approval gates, and evidence.
---

# OGENIC Agent Harness Guardrails

## Existing authority path

- **VIOLET / P-Stack** selects the task-appropriate skill.
- **YELLOW / MA-OP** retains execution authority and approval gates.
- **RUBY** independently checks results and evidence.
- **GREEN / owner-main / 1LSS** retains compact verified summaries and evidence references.
- **GitHub** remains canonical for source and CI; **Cloudflare** remains the primary runtime; **D1** remains the existing canonical operational state.

## Operating rules

1. Reuse the current agent registry, runner, gateway, and memory. Do not create duplicates.
2. Parallelize read-only investigation when useful; execution permission does not spread to delegated agents. Route results back through Ruby.
3. Invoke only tools and adapters that are actually connected and permitted. A configured name is not proof of a live adapter.
4. Keep READ, WRITE, and EXECUTE permissions distinct. Preserve owner approval for consequential side effects.
5. Never use hidden provider fallback, unbounded retry, unapproved paid calls, or secret values in logs, prompts retained as memory, or D1.
6. Keep task states separate: planned, source changed, tests passed, deployed, and runtime verified are different claims.
7. Tie evidence to the exact source SHA and CI Run ID. Do not infer runtime state from source or CI alone.
8. Store only verified compact summaries and evidence references in the existing 1LSS memory. Do not introduce a parallel memory store.
9. End handoffs with `RESULT | EVIDENCE | BLOCKED | NEXT`, naming the next action and its owner.

This is an OGENIC-authored adaptation informed by selected patterns in [ECC](https://github.com/affaan-m/ECC) (MIT). It is not the full ECC system or a new execution runtime.
