---
name: engineering-loop
description: Apply specification-first, minimal-diff, test-driven engineering and evidence-based handoff.
---

# OGENIC Engineering Loop

This OGENIC-authored skill selectively adapts practices reviewed in [Matt Pocock Skills](https://github.com/mattpocock/skills) and [ECC](https://github.com/affaan-m/ECC), with general guardrails independently worded after reviewing [Karpathy-Inspired Claude Code Guidelines](https://github.com/multica-ai/andrej-karpathy-skills).

1. Read the current branch/SHA, relevant code, related tests, architecture docs, and project rules before editing.
2. Define acceptance criteria that can be checked. If an ambiguity blocks a safe change, ask one focused question; otherwise state a narrow assumption and proceed.
3. For bugs, reproduce the behavior before applying the fix. Prefer a test that captures the failure.
4. Make the smallest change that meets the goal. Avoid unrelated refactors, speculative abstractions, and touching adjacent code without a reason.
5. Test behavior rather than implementation details. Run the existing project checks that apply; for this repository, use `npm run check` when the environment supports it.
6. Review the diff for security, compatibility, and blast radius. Confirm CI ran against the same SHA used in the report.
7. Report source, CI, deploy, and runtime results separately. A green source test is not a runtime receipt.
8. Use existing P-Stack skills and agent workflows; do not install a second full skill catalog to obtain overlapping behavior.
9. Preserve approval gates and staging-first constraints. Do not alter production, Candy, secrets, permissions, or D1 schema/data without explicit owner authorization.

This file is independently authored. No source file or wording from the Karpathy-Inspired repository is copied; no license file was found there during review.
