# AUSTRA v6 · OGENIC Phase VI · Workflow Engine v0.1

## Architecture

Build a **durable workflow interpreter inside the existing API**, not a new orchestration platform. Develop and test against staging resources only.

| Component | Responsibility |
|---|---|
| Existing API | Start/cancel runs, receive webhooks, expose status, host executor and adapter registry. |
| D1 | Immutable workflow versions, run state, node results, deduplication and execution leases. |
| GitHub | Version workflow definitions and prompts; receive changes on isolated branches and draft PRs. |
| Linear | Supply task context and receive status/PR links through existing integration handlers. |
| Infisical | Resolve scoped credentials at execution time. Never store secret values in definitions, D1 or model context. |
| Codex / Claude | Interchangeable agent adapters: Codex for implementation; Claude for analysis/review. Use only the agent required by the workflow. |
| Existing scheduler | Invoke a bounded executor tick. D1 is the durable work queue; no additional queue infrastructure in v0.1. |

### Execution model
- Immutable, versioned JSON workflows.
- Acyclic graph with **one active node per run**.
- Manual and signed-webhook triggers.
- Three reusable primitives: `action`, `agent`, `gate`.
- Inputs resolve from run input and completed node outputs; no arbitrary expressions.
- Agent adapters return structured results; asynchronous jobs persist a provider job ID and resume by polling or verified callback.
- Existing integrations are wrapped behind a registry. Add thin adapters only where handlers are missing.

### Minimal API surface
- `POST /workflows/:id/runs` — pin a version and start; accept an idempotency key.
- `GET /runs/:id` — status, bounded outputs and errors.
- `POST /runs/:id/cancel` — cooperative cancellation.
- `POST /hooks/:source` — verify, normalize and deduplicate events.
- Internal `executor.tick()` — claim and advance eligible runs.

### Boundaries
- No visual editor, parallel execution, loops, subworkflows, general-purpose code nodes or new secret store.
- Registry allowlists operations, repositories, Linear projects and environments.
- Agents receive no production credentials or deployment tools.
- GitHub writes target isolated branches and draft PRs; merging remains human-controlled.
- Keep prompts versioned and short. Fetch only required fields/files; do not pass entire workflow history between agents.
- Enforce per-run limits on nodes, agent calls, tokens, elapsed time and output size.

## Node Contract

```json
{
  "id": "implement",
  "kind": "agent",
  "uses": "codex.patch@1",
  "inputs": {
    "task": { "$ref": "run.input#/task" },
    "context": { "$ref": "nodes.context.output#/files" }
  },
  "output_schema": {
    "type": "object",
    "required": ["summary", "patch"],
    "properties": {
      "summary": { "type": "string" },
      "patch": { "type": "string" }
    },
    "additionalProperties": false
  },
  "timeout_seconds": 120,
  "retry": { "max_attempts": 1 },
  "limits": {
    "max_input_tokens": 6000,
    "max_output_tokens": 2000
  },
  "next": "publish_draft"
}
```

Operation names are registry identifiers, not assumed existing API routes.

| Field | Rule |
|---|---|
| `id` | Unique within a workflow version. |
| `kind` | `action`, `agent` or `gate`. |
| `uses` | Versioned adapter/operation identifier. |
| `inputs` | Literal JSON or explicit `$ref` bindings using JSON Pointer. Missing references fail before invocation. |
| `output_schema` | Required; validate before committing success. |
| `timeout_seconds` | Subject to a server-side maximum. |
| `retry` | Policy ceiling; cannot override adapter retry safety. |
| `limits` | Optional tighter limits; server-side budgets always apply. |
| `next` | Node ID, `null`, or gate routing: `{"true":"a","false":"b"}`. |

### Primitive behavior
- `action`: invoke a registered existing-API operation.
- `agent`: invoke one agent with a bounded prompt, allowed context and structured output.
- `gate`: evaluate a small predicate such as `equals` or `exists`; return a boolean. No model call.

### Adapter interface

```text
execute(input, context) ->
  succeeded(output)
  | waiting(external_job_id, next_check_at)
  | failed(error_code, retryable)
  | uncertain(reconciliation_reference)
```

`context` includes run/node IDs, deadline, stable idempotency key, cancellation signal and a runtime credential resolver.

Adapters declare side-effect class, retry safety and reconciliation support. Credential selection is server-controlled, never model-controlled.

## Execution Flow

1. **Register**
   - Load an approved workflow definition from GitHub into the existing API.
   - Validate graph, bindings, schemas, operations, budgets and environment policy.
   - Store an immutable version with its Git commit SHA.

2. **Trigger**
   - Authenticate the caller or verify the webhook.
   - Deduplicate by workflow and trigger key.
   - Create a queued run pinned to one workflow version.

3. **Claim**
   - Executor tick atomically claims an eligible run in D1 using a conditional update.
   - Assign an expiring lease and increment its fencing token.
   - Workers must hold the current token to commit state.

4. **Prepare**
   - Resolve only the active node’s inputs.
   - Check permissions, budgets and cancellation.
   - Persist the node invocation and stable key: `run_id:node_id`.
   - Resolve required Infisical credentials immediately before invocation.

5. **Execute**
   - Invoke the adapter outside the D1 transaction.
   - Persist asynchronous job IDs and release the lease while waiting.
   - Use bounded polling with backoff; callbacks only wake persisted work after verification.

6. **Commit**
   - Validate output, redact errors and record usage.
   - Atomically persist the result and advance the cursor using D1 transactional batches with fencing checks.
   - Schedule safe retries using `next_attempt_at`; do not sleep inside requests.

7. **Recover**
   - Expired leases allow another worker to resume.
   - Reuse completed node outputs; never rerun them automatically.
   - Retry reads and explicitly idempotent operations.
   - Reconcile ambiguous writes using their stable key/provider reference.
   - If reconciliation is impossible, mark the node `uncertain` and block the run for operator review.

8. **Finish**
   - End as succeeded, failed or cancelled.
   - Cancellation prevents subsequent nodes; it cannot undo external effects already performed.

**Guarantee:** durable, at-least-once scheduling—not universal exactly-once external effects.

### First workflow

```text
Manual trigger with Linear issue
→ action: fetch issue and bounded repository context
→ agent: Codex produces structured summary and patch
→ action: publish isolated branch + draft PR
→ action: attach PR link to Linear issue
→ complete
```

Use Claude instead for analysis-only workflows, or add an explicit review node when justified. Do not call both by default.

## Minimal Schema

```text
workflow_versions
  workflow_id          TEXT
  version              INTEGER
  git_sha              TEXT NOT NULL
  definition_json      TEXT NOT NULL
  created_at           INTEGER NOT NULL
  PRIMARY KEY (workflow_id, version)

runs
  id                   TEXT PRIMARY KEY
  workflow_id          TEXT NOT NULL
  workflow_version     INTEGER NOT NULL
  trigger_key          TEXT NOT NULL
  status               TEXT NOT NULL
  current_node_id      TEXT
  input_json           TEXT NOT NULL
  usage_json           TEXT NOT NULL
  next_attempt_at      INTEGER
  lease_owner          TEXT
  lease_until          INTEGER
  fence                INTEGER NOT NULL DEFAULT 0
  error_json           TEXT
  created_at           INTEGER NOT NULL
  updated_at           INTEGER NOT NULL
  UNIQUE (workflow_id, trigger_key)
  FOREIGN KEY (workflow_id, workflow_version)
    REFERENCES workflow_versions(workflow_id, version)

node_executions
  run_id               TEXT NOT NULL
  node_id              TEXT NOT NULL
  status               TEXT NOT NULL
  attempt_count        INTEGER NOT NULL DEFAULT 0
  idempotency_key      TEXT NOT NULL UNIQUE
  external_job_id      TEXT
  output_json          TEXT
  error_json           TEXT
  usage_json           TEXT
  started_at           INTEGER
  finished_at          INTEGER
  PRIMARY KEY (run_id, node_id)
  FOREIGN KEY (run_id) REFERENCES runs(id)
```

- Run states: `queued | running | waiting | blocked | succeeded | failed | cancelled`.
- Node states: `running | waiting | succeeded | failed | uncertain`.
- Index runs on `(status, next_attempt_at, lease_until)`.
- Cap inline inputs/outputs, for example at 32 KiB each. Reject oversized results in v0.1 rather than adding artifact infrastructure.
- Store sanitized errors and usage metadata, not credentials or full model transcripts.
- One row per node execution; defer full attempt-history storage.

## First Implementation Tasks

1. **Inventory existing capabilities**
   - Locate API runtime, D1 binding, scheduler, authentication and existing integration handlers.
   - Confirm Codex/Claude invocation modes and Infisical environment scopes.
   - Record gaps without introducing new infrastructure prematurely.

2. **Define contracts and policies**
   - Implement workflow/node JSON schemas, graph validation, binding resolution and adapter interfaces.
   - Add staging-only operation/resource allowlists and hard budget defaults.

3. **Create D1 migrations and run endpoints**
   - Add the three tables, indexes, immutable registration and trigger deduplication.
   - Implement start, inspect and cooperative cancel.

4. **Build the durable interpreter**
   - Implement claim/lease/fencing, one-node advancement, transactional commits, waiting and safe retry scheduling.
   - Add deterministic `gate` and fake adapters first.

5. **Wrap existing integrations**
   - Add scoped Linear/GitHub actions and runtime Infisical resolution.
   - Implement a shared agent adapter interface for Codex and Claude, including output validation and usage accounting.

6. **Implement the first workflow**
   - Use one test Linear issue, one sandbox repository and one agent call.
   - Produce a draft PR and attach its link. No merge or deployment capability.

7. **Test failure boundaries**
   - Duplicate triggers, competing workers, lease expiry and stale commits.
   - Crash before/after external writes; verify reconciliation or blocking.
   - Async completion, cancellation, malformed model output, exhausted budgets and secret redaction.

8. **Run local/staging acceptance**
   - Verify restarts resume correctly and duplicate events do not create duplicate runs.
   - Document blocked-run recovery.
   - Stop at a reviewed implementation PR and staging evidence; **do not deploy production**.
