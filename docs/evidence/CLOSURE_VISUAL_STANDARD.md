# OGE Closure Visual Standard

Going forward, an OGE issue is not considered fully closed until its result has **one human-readable visual evidence artifact** in GitHub, when the task type supports a truthful visual.

## Required closure package

```text
docs/evidence/OGE-<id>/
  README.md
  closure.svg
```

Raster `closure.png` is allowed when a real UI screenshot is the strongest evidence.

## Visual type by task

- UI/UX -> real screenshot or preview capture
- architecture/routing -> Mermaid/SVG flow
- backend/runtime -> compact evidence-flow diagram
- CI/test-only -> pass/fail evidence card or test-flow
- docs/research -> source-to-decision diagram

## Integrity rules

1. Never fabricate screenshots or runtime state.
2. Visual claims must be derived from code, test, CI, staging/runtime or cited source evidence.
3. Black/white/grayscale is the default exhibition style.
4. Urgent bugfixes do not wait for decorative polish; a plain truthful evidence diagram is enough.
5. Historical issues are not retroactively required unless explicitly requested.
6. Linear closure comment must reference the canonical GitHub commit/CI evidence and visual path.

## README sections

Every closure README must contain:

- RESULT
- CHANGED
- TESTS
- EVIDENCE
- RESIDUAL RISK

The visual is a summary of evidence, not a substitute for evidence.

## OGE-112 closure evidence and actor chain
Prospectively use `closure.json` alongside README and a truthful `closure.svg`/real UI image. Add README heading `ROOT CAUSE / MISSED STEPS`. Canonical skill numbers 1..51 must match `config/pstack-task-taxonomy.json` and checksummed IDs: e.g. `Pstack: 1,9,24,36`. Record implementer, reviewer, committer, deployer with verifiable IDs/links; exact SHA, CI/deploy receipts, independent Ruby PASS and mistakes/missed steps. Do not fabricate reviewer, image or deployment for documentation-only tasks: such issues require explicit scoped exception through existing approvals. A structural gate cannot prove remote links or block Linear independently. Run `node scripts/oge112-check-closure.mjs OGE-123`, or GitHub Action `oge112-closure-evidence-gate.yml` on staging. **The previous graphic standard was not automatically enforced**: observed closure images in GitHub exist only for OGE-80 through OGE-88 in the inspected commit. Never report every later issue had an image without evidence.
