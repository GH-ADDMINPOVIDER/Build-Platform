# GS Command Plane — v0.1

## Ownership boundary

GS owns the command surface, parser/normalizer, command registry, intent routing, risk classification handoff, correlation/idempotency metadata, result/readback requirements, and dashboard-facing command status.

CC owns the runtime/tool adapters, including the Hermes protocol, MCP invocation, host/SSH, Infisical bridge, provider adapters, adapter health/retry, and adapter-side registry integration.

The Command Plane must call adapters only through the shared Adapter Contract. It must not import Hermes directly or write CC-owned adapter files.

## Registered Solo commands

| Command | Purpose | Boundary |
|---|---|---|
| `/solo.help` | List commands and constraints | Read-only |
| `/solo.index` | Open the capability and workflow index | Read-only adapter required |
| `/solo.status` | Current system and connector status | Read-only |
| `/solo.inspect <target>` | Inspect a target | Read-only adapter required |
| `/solo.route <request>` | Route a natural-language request | Planning only |
| `/solo.run <request>` | Request execution | CC Adapter Contract required |
| `/solo.verify <target>` | Independent readback | Read-only adapter required |
| `/solo.audit.latest` | Latest audit | Read-only adapter required |
| `/solo.history <filter>` | Command history | Read-only adapter required |
| `/solo.handoff <task>` | Durable agent handoff | CC Adapter Contract required |
| `/solo.rollback.plan <target>` | Prepare rollback plan | Planning only |

Existing `/WF.*` commands are accepted as aliases only where a matching canonical Solo command exists.

## Envelope metadata

The resolver emits a deterministic correlation ID and idempotency key from the canonical command and normalized intent. It does not sign an Owner envelope, persist state, invoke an adapter, or claim execution.

Every completed execution must provide:
1. execution receipt (run/job/task identifiers);
2. independent readback of the resulting state;
3. source and provenance reference;
4. secret-safe result metadata.

## State semantics

- `PLANNED_ONLY`: resolved locally; no adapter is needed for planning.
- `WAITING_ADAPTER_CONTRACT`: command is recognized but not dispatched until the CC-owned adapter contract is connected.
- `UNRECOGNIZED`: no registered command matched.
- No command may report `DONE` or `PASS` from resolver output.

## Shared integration contract still required

Before execution dispatch is implemented, GS and CC must agree on:
- adapter method and version;
- request envelope and allowed fields;
- Owner capability/grant representation and verification result;
- adapter response, error taxonomy, and retry semantics;
- idempotency enforcement location;
- evidence receipt and independent readback interface.

No production dispatch, merge, deploy, credential mutation, or destructive action is introduced by this module.
