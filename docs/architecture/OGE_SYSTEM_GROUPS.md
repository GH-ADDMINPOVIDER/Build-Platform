# OGENIC / WAVE Functional Architecture Groups

Canonical branch: `phase-vi-provider-incentive-metering`.

This file groups OGE work by runtime responsibility so the system can be understood as one connected architecture instead of an issue list.

## First-view flow

```text
WAVE
 -> ATHENA + BLUE
 -> YELLOW / MA-OP
 -> CCS / Use Card
 -> VIOLET / Agents + Workflows
 -> RUBY / Verification
 -> GREEN / owner-main / 1LSS
```

Supporting evidence comes from GitHub, Linear, Cloudflare and D1.

## G0 — Setup and map administration

Not runtime architecture.

Issues: OGE-1, OGE-2, OGE-3, OGE-4, OGE-85, OGE-86.

OGE-21 was not present in the Linear export used for this grouping, so no role is invented for it.

## G1 — WAVE / Human Surface

User-facing web, chat, operate, composer, status and presentation surfaces.

Issues: OGE-7, OGE-13, OGE-20, OGE-27, OGE-29, OGE-31, OGE-44, OGE-46, OGE-50, OGE-51, OGE-52, OGE-53, OGE-57, OGE-63, OGE-64, OGE-65, OGE-77.

## G2 — ATHENA + BLUE / Admission and Planning

Identity, admission, registry, command planning and guarded handoff.

Issues: OGE-30, OGE-33, OGE-34, OGE-35, OGE-36.

## G3 — YELLOW / MA-OP / Authority and Execution

Capability resolution, guarded execution, routing and protocol execution boundary.

Issues: OGE-14, OGE-22, OGE-23, OGE-24, OGE-25, OGE-26, OGE-28, OGE-40, OGE-41, OGE-43, OGE-49, OGE-56, OGE-66, OGE-67, OGE-71, OGE-73, OGE-74, OGE-76, OGE-80, OGE-81.

## G4 — CCS / Use Card / Capability Lease

Capability Card Stone, bounded delegation and scope control.

Issues: OGE-17, OGE-19, OGE-32, OGE-78, OGE-79, OGE-82.

## G5 — VIOLET / Multi-Agent and Workflow Fabric

Parallel work, provider lanes, workflow execution and cross-agent coordination.

Issues: OGE-37, OGE-47, OGE-54, OGE-60, OGE-61, OGE-69, OGE-70, OGE-72.

## G6 — RUBY / Verification and Evidence

Verification, failure testing, evidence gates and final reconciliation.

Issues: OGE-38, OGE-45, OGE-55, OGE-62, OGE-84.

## G7 — GREEN / 1LSS / Knowledge Refinery

Canonical session continuity, verified retention, distillation and provenance.

Issues: OGE-11, OGE-39, OGE-42, OGE-48, OGE-83.

## G8 — Providers / Research / External Specialists

Provider-specific bridges and specialist lanes subordinate to the execution boundary.

Issues: OGE-15, OGE-18, OGE-58, OGE-59, OGE-68, OGE-75.

## G9 — Later / Frozen / Legacy

Deferred, frozen, canceled or superseded work kept out of the active first-view map.

Issues: OGE-5, OGE-8, OGE-9, OGE-10, OGE-12, OGE-16.

## Canonical edge set

1. WAVE -> ATHENA/BLUE: intent enters admission and planning.
2. ATHENA/BLUE -> YELLOW: guarded command handoff.
3. YELLOW -> CCS: capability, scope and lease checks.
4. CCS -> VIOLET: authorized work fans out.
5. VIOLET -> RUBY: result and evidence return.
6. RUBY -> GREEN/1LSS: verified promotion.
7. GitHub/Linear/Cloudflare/D1 -> RUBY or GREEN: implementation and runtime evidence.
8. GREEN/1LSS -> ATHENA: compact canonical context feeds later work.

## Inclusion rules

- Main diagram shows functional nodes, not one box per issue.
- Canceled and superseded work is not shown as active runtime.
- Provider sessions are projections or continuation aids, not canonical authority.
- n8n is workflow execution fabric, not the control plane.
- Linear is task and evidence ledger, not runtime authority.
- GitHub is canonical code, branch and CI evidence.
- Yellow is the execution-authority boundary.
- Ruby verifies before Green retention.
