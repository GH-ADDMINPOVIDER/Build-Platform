# OGENIC PHASE VI

## Harness Capability

**Type : OGENIC 1LSS — Auto Session Access**

## Canonical product direction

OGENIC Phase VI is a mobile-first federated AI operating layer. The owner interacts through one control surface while OGENIC coordinates specialist agents, platform-native automation, cloud runtimes, memory, tools and human approval.

The product goal is one continuous owner session across web, app and approved agents. The system must preserve one canonical identity, one ordered session line and one shared operating context rather than creating separate truths per surface.

## 1LSS contract

- Canonical conversation: `owner-main`.
- Canonical ordered line: `1LSS_OWNER_MAIN`.
- D1 is the canonical operational memory and project-direction store.
- `source_surface` identifies the door used to enter the same session; it must not create a separate conversational truth.
- Every OGENIC agent or delegated specialist should load canonical D1 direction before planning or executing work.
- Verified outcomes, decisions and handoffs should return to shared state so later agents continue from the same direction.
- Raw credentials, tokens and hidden chain-of-thought never belong in D1 or RAG.

## Federated agent architecture

OGENIC is the supervisor and capability router, not the only worker. Platform-specific work should be delegated to the platform-native agent or execution surface when that surface is available and appropriate.

Examples:
- Cloudflare: Worker, D1, Assets, Browser, Builds, runtime diagnostics and Cloudflare-native operations.
- GitHub/Codex: source code, branches, commits, PRs, review and version history.
- Manus: long-running research and delegated autonomous tasks.
- Figma: product/design work.
- Linear: task and project coordination.
- Notion / Google Drive: knowledge and source documents according to canonical-source rules.
- n8n: event and integration bridge where a native agent or direct connector is not available.
- DeepSeek: planned specialist model/provider. It is not live until its adapter, server-side credential binding, capability map and runtime verification are complete.

The supervisor should route by capability, quota, risk and current provider health, then merge verified results back into 1LSS/D1.

## Runtime direction

Cloudflare is the primary Phase VI full-stack runtime.

Target responsibility:
`Assets + Worker APIs + D1 + Session/Auth + Browser + Builds/Deploy + Runtime health`.

GitHub remains the canonical source/version-control system, but Cloudflare-native build/deploy should be preferred for Cloudflare runtime work when available so GitHub Actions capacity is preserved for work that specifically needs GitHub runners.

## Product destination

Two product destinations are tracked in parallel:

1. Demonstrable architecture and runtime proof suitable for an OpenAI showcase/proposal or technical case study.
2. A commercial Apple application where the mobile device is the control plane for a distributed AI ecosystem.

Product positioning: the infrastructure is distributed while control stays in the user's hand. Mobile-first operation is a core product property, not merely a responsive UI.

## Current milestone

Finish and verify OGENIC 1LSS — Auto Session Access:

- shared session continuity across `/chat` and `/app`;
- D1 canonical memory and project-direction retrieval;
- deterministic RAG context from D1 plus optional file-search knowledge;
- platform-agent delegation with canonical-context handoff;
- owner authentication and human approval for side effects;
- staging verification before any production promotion.

## Safety and deployment invariants

- Staging first.
- Do not touch main, production or Candy resources without explicit approval.
- Side effects and sensitive permission changes require owner approval.
- Never expose raw secrets.
- Do not claim an agent/provider is live until runtime evidence verifies it.
- DeepSeek remains PLANNED until explicitly integrated and verified.


## Deployment pipeline

Cloudflare Workers Builds is the preferred staging deployment path for Phase VI Cloudflare runtime work.
GitHub remains source/version control; Cloudflare runs staging build, D1 migrations and Worker deployment when this branch changes.
