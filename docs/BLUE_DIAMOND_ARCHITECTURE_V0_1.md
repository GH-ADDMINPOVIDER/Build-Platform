# BLUE DIAMOND — Agent Command Layer v0.1

Status: scaffold / staging only

Canonical repo: `Ogenicchocolate21debug/Build-Platform`
Canonical branch: `phase-vi-provider-incentive-metering`
Canonical conversation: `owner-main`
Canonical session: `1LSS_OWNER_MAIN`

## Position

BLUE DIAMOND is Stone IV of WAVE / OGENIC.

It is not a replacement for Green Stone, Yellow Stone, White Diamond, D1, or 1LSS.
It is the governed agent layer that gives ATHENA a persistent command identity and controls how new chats and worker agents enter the system.

```text
OWNER
  -> PRIMARY CONTROLLER
  -> BLUE DIAMOND / ATHENA CHECK-IN
  -> AGENT PRE-RUN
  -> YELLOW STONE POLICY + CAPABILITY RESOLUTION
  -> EXECUTION
  -> VERIFIED EVIDENCE
  -> GREEN STONE / 1LSS
```

## Stone map

- Green Stone: canonical memory, continuity, state, 1LSS.
- Yellow Stone: capability, permission, policy, execution authority.
- White Diamond: existing bounded intelligence / plan plane. Keep current contracts intact.
- Blue Diamond: governed agent roster, ATHENA command identity, check-in and pre-run admission control.

## ATHENA identity

ATHENA is a system-level command agent inside Blue Diamond.

ATHENA may:
- read canonical state;
- request fresh reconciliation from authoritative sources;
- classify risk;
- select an eligible agent or tool lane;
- issue a bounded handoff packet;
- detect stale or conflicting state;
- stop or escalate when evidence is insufficient.

ATHENA may not:
- approve its own risky action;
- bypass Yellow Stone;
- treat stale memory as fresh evidence;
- execute WRITE / EXECUTE / DANGEROUS actions directly;
- create a second memory database;
- store raw secrets, cookies, passwords, private keys, or tokens in D1.

## Admission rules

### Primary controller

The primary controller keeps owner continuity and does not re-preflight on every message.
A Blue Diamond check-in is required when one of these happens:

- `NEW_CHAT`
- `RESUME_SESSION`
- `CONTEXT_SHIFT`

### ATHENA and all worker agents

Before every worker run:

1. read canonical 1LSS state;
2. reconcile authoritative evidence required for the task;
3. verify do-not-touch scope and current mission;
4. classify permission / risk;
5. verify selected actor is eligible and available;
6. create a bounded handoff;
7. send all execution through Yellow Stone.

The run must fail closed when current evidence is missing.

## Authority hierarchy

- Owner: final human authority.
- Primary Controller: continuity supervisor above ATHENA.
- ATHENA: command / reconcile / route.
- Proven Agents: agents that have passed real execution + verification.
- Candidate Agents: not trusted until they pass field tests.
- Tools / State Sources: may provide evidence or actions but are not agents unless they can reason, converse, adapt, and operate autonomously.

## Initial roster semantics

Core:
- ChatGPT Main Controller — proven controller, bridge only; ChatGPT session is not copied into WAVE.
- Codex — proven execution agent.
- GitHub — evidence/source arm; tool only.
- Linear — task-state arm; tool only.
- ATHENA — commander candidate until it passes real admission/routing/recovery tests.

Candidate agent lanes:
- Manus
- Perplexity
- DeepSeek
- Claude
- Gemini
- Grok
- GitHub Copilot
- Cursor

Support lanes:
- Notion — knowledge source/tool.
- Cloudflare — runtime/tool.

WAVE is the control surface. OpenAI API and other model APIs are runtimes/providers, not automatically separate trusted agents.

## Maturity ladder

```text
CANDIDATE
  -> PROVEN_AGENT
  -> SPECIALIST
  -> COMMANDER_CANDIDATE
  -> COMMANDER
```

Promotion requires real evidence. A name or provider reputation is not sufficient.

Minimum proof dimensions:
- context intake;
- instruction fidelity;
- tool use;
- completion;
- evidence quality;
- recovery after failure;
- escalation when context is insufficient;
- policy compliance;
- no canonical-state corruption.

## v0.1 API contract

Planned staging-only endpoints:

- `GET /api/blue-diamond/registry`
- `POST /api/blue-diamond/check-in`
- `POST /api/blue-diamond/preflight`

All endpoints are owner/ops protected.
All outputs redact server-side credential references.
No endpoint directly executes providers.
Execution authority remains `YELLOW_STONE_ONLY`.

## Check-in contract

A check-in returns a bounded packet containing:

- canonical conversation/session;
- latest 1LSS sequence when available;
- event reason;
- ATHENA identity;
- explicit `PENDING_FRESH_TOOL_READS` reconciliation state;
- authoritative source requirements;
- no false claim that GitHub/Linear/runtime were freshly verified unless they were actually called.

## Pre-run contract

Every non-controller agent run requires `AGENT_PRE_RUN`.

Outcomes:
- `READY`
- `READY_WITH_LIMITS`
- `CHECKIN_NOT_REQUIRED`
- `PREFLIGHT_REQUIRED`
- `CONFIGURATION_REQUIRED`
- `HUMAN_APPROVAL_REQUIRED`
- `NOT_AGENT_EXECUTABLE`
- `REAUTH_REQUIRED`

WRITE / EXECUTE / DANGEROUS requests always stop before provider execution and hand control to Yellow Stone / human approval policy.

## Guardrails

- staging only;
- never touch `main` or production;
- never touch Candy;
- no D1 schema change in Blue Diamond v0.1;
- no new memory database;
- no secret migration;
- minimum reversible diff;
- fresh evidence wins over stale UI or remembered status;
- absence of new evidence is UNKNOWN, not proof of incomplete work.

## Acceptance for first scaffold

- Blue Diamond has an explicit registry contract.
- ATHENA exists as `COMMANDER_CANDIDATE`, not self-declared proven.
- GitHub/Linear are correctly classified as tool/state arms, not conversational agents.
- controller check-in and agent pre-run rules are machine-readable.
- no Blue Diamond route can directly execute WRITE/EXECUTE/DANGEROUS work.
- Yellow Stone remains the only execution authority.
- Green Stone / `owner-main` / `1LSS_OWNER_MAIN` remain canonical memory.
