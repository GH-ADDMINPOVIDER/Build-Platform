# MA-OP GitHub Harness Bridge

OGE-43 first slice: a READ-only DeepSeek Harness-compatible tool bridge for GitHub capabilities.

## Trust boundary

Flow:

`Harness tool -> MA-OP bridge -> Yellow policy/execution -> GitHub adapter -> evidence -> Ruby verify -> Green eligibility`

The package deliberately contains no direct GitHub HTTP client and no credential lookup. A server-owned `executeYellow` binding is mandatory. If that binding is absent, construction fails closed. GitHub credentials remain in the Unifiend server/runtime boundary and never enter Harness tool arguments or results.

## Registered capabilities

- `github.repo.read`
- `github.file.read`
- `github.code.search`
- `github.issue.read`
- `github.pr.read`
- `github.actions.status`

All are permission class `READ`. There are no write, merge, delete, release, deploy, secret, or billing capabilities in this slice.

## Harness contract

The plugin exports:

- `name = "maop-github-harness"`
- `inject = ["tools"]`
- `apply(ctx, bindings)`
- capability registration through `ctx.tools.register(defineTool(...))`

The `defineTool` helper is intentionally structural and dependency-free in this repository package; Unifiend does not vendor DeepSeek Harness upstream. The registered tool shape is bounded to name, description, input schema and execute callback.

`ctx.effect` is used when present so every registration is cleaned up on unload. The invoking Harness `agentId` is forwarded as the MA-OP actor. Harness cancellation signals are honored before and during Yellow routing.

## Verification and retention

Yellow response verification is normalized first. Ruby verification is a separate callback. `retention_eligible` becomes true only when:

1. Yellow reports `ok: true`;
2. Yellow verification is `verified`; and
3. Ruby returns `verified: true`.

Without Ruby verification, the result can be returned to the caller but cannot be retained as verified Green/1LSS state.

## Current canonical limitation

The canonical Yellow execution adapter currently implements GitHub `read_file`. The other normalized GitHub READ capabilities remain fail-closed through Yellow until their safe native adapters are implemented. The bridge never bypasses Yellow to make them work.

## Test

`npm test`

The deterministic fixture suite covers registration, scoped cleanup, actor attribution, cancellation, strict inputs, credential rejection, Yellow-only routing, direct-GitHub bypass prevention, safe failure normalization, Ruby verification and retention gating.
