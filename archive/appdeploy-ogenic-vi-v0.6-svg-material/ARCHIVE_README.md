# OGENIC VI — AppDeploy Draft Archive

Archived from AppDeploy for later selective migration into the canonical Cloudflare / D1 Phase VI system.

- Source app: ogenic-ai-9ybjnj
- AppDeploy snapshot: 1789730135463
- Archived date: 2026-09-18
- Source branch base: phase-vi-provider-incentive-metering
- Archive branch: archive/appdeploy-ogenic-vi-v0.6-2026-09-18
- App version in snapshot: 0.6-svg-material
- Visible title: OGENIC VI
- Subtitle: Harness Capability

## Purpose

This folder is a frozen draft/reference. Do not treat AppDeploy as the canonical runtime.

When reusing this work in Cloudflare, port only the useful UI/UX and logic. In particular:
- keep the Home / Chat / Tools / Tasks / System concepts if useful;
- keep the agent-mode structure and poster/UI experiments selectively;
- replace AppDeploy-specific imports and runtime calls;
- move canonical state/memory to the existing Cloudflare / D1 architecture;
- connect tools through the OGENIC Tool Gateway;
- preserve owner auth + Human Approval requirements;
- do not touch main/prod or Candy during migration.

## AppDeploy-specific code to replace during Cloudflare migration

- `@appdeploy/client`
- `@appdeploy/sdk`
- AppDeploy `ai.generate`
- AppDeploy router/runtime assumptions

The original AppDeploy app remains separate; this archive is only a source snapshot for future extraction.
