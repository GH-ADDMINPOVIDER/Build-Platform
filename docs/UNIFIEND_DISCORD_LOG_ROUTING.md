# Unifiend / OGENIC — Discord Log Routing

**Status:** Routing specification only. This document does not claim that Discord channels, webhooks, or runtime delivery have been configured.

**Target:** `Unified-on-Progress` staging work in Build-Platform.

## Operating principles

1. Discord is the operational event stream; Unifiend Dashboard is the browsable status and evidence surface.
2. One event has one canonical destination. Cross-post only critical incidents and explicitly requested summaries.
3. Every status must be evidence-backed. A commit is not a successful deployment; a requested job is not a completed job.
4. Use channel IDs supplied by configuration, never hard-code Discord channel IDs in application logic.
5. Never post secrets, tokens, authorization headers, raw environment values, private file contents, or unredacted personal data.
6. Include stable event/run/incident IDs so messages can be correlated across channels and dashboard history.
7. Keep the canonical seven-stone identity and frozen Stone Phase scope unchanged. Policy logs record existing evaluations; they do not create stones or expand the roadmap.

## Proposed Discord categories and channels

### `00 · OPS — LIVE EVENTS`

| Channel | Route here | Do not send here |
| --- | --- | --- |
| `#log-critical-alerts` | P0/P1 outages, production down, confirmed data-loss/security incident, a blocker requiring immediate human action | Routine warnings and every retry |
| `#log-errors` | Application exceptions, failed requests, unhandled errors, exhausted retries; sanitized stack excerpt and fingerprint | Secrets or full user payloads |
| `#log-warnings` | Degraded health, rate limits, approaching thresholds, recoverable failures, stale dependencies | Healthy heartbeats and routine noise |
| `#log-runtime` | Service start/stop/restart, health transitions, readiness, heartbeat summaries, resource thresholds | Full debug traces |
| `#log-jobs-queue` | Work accepted, queued, started, retried, completed, cancelled, or dead-lettered | Every internal step of a successful job |
| `#log-agent-runs` | Agent/task run lifecycle, handoffs, tool-call outcome summaries, duration, task/run references | Hidden reasoning or unrestricted conversation contents |
| `#log-integrations` | Discord, Drive, GitHub, MCP, n8n, OpenAI/API and other integration status, latency, auth/config failure category, retry outcome | Credential values, signed URLs, or authorization headers |

### `01 · DELIVERY — CHANGE & RELEASE`

| Channel | Route here | Do not send here |
| --- | --- | --- |
| `#log-updates` | Human-readable change notes for application/config/docs/dependency/schema updates; include scope and source PR/commit when known | Claiming a deployment succeeded without deployment evidence |
| `#log-commit-deploy` | Commit SHA, branch, PR, CI run, target environment, deployment ID/URL, start/end time, and verified outcome | A deployment success message before the provider confirms it |
| `#log-ci-tests` | Build, lint, typecheck, unit/integration/e2e test summaries; failed job and artifact links | Repeated full test output when a concise summary and artifact suffice |

### `02 · GOVERNANCE — CONTROL & AUDIT`

| Channel | Route here | Access |
| --- | --- | --- |
| `#log-approvals` | Human approval requested/granted/denied/expired, requester, approver, scope, timestamp, and reference | Secrets or approval tokens |
| `#log-security-audit` | Access denied, permission changes, authentication/configuration failure categories, secret rotation *event metadata*, suspicious activity | Secret values or sensitive payloads |
| `#log-policy-decisions` | Outcomes from existing policy/rule checks, policy version/reference, pass/fail/deny reason, evidence link | Editing the canonical stone map or expanding the frozen Stone Phase |

Restrict governance channels to the smallest practical operator group. If the server supports it, keep a separate read-only role for audit viewers.

### `03 · DIGESTS — HUMAN SUMMARY`

| Channel | Route here | Frequency |
| --- | --- | --- |
| `#log-daily-summary` | Counts of successes/failures, open critical incidents, deployments, blocked jobs, and links to the underlying records | One daily digest, plus an optional incident-only summary |

### Evidence and file intake

- Preserve the existing `#unifiend-inbox` as the canonical evidence-ingestion channel for the current reader.
- Do **not** route operational logs into `#unifiend-inbox`; keep attachments and log events separate.
- Do not add `#unifiend-photos` or `#unifiend-files` as active ingestion destinations until the reader is explicitly extended to allow-list and read those channels and the end-to-end image/file path is verified. Until then, those proposed channels would appear separate but would not necessarily be readable by the current MCP tool.
- The Unifiend Dashboard can present log history and evidence as separate panels, linking each item back to its original Discord message/run where supported.

## Minimum event envelope

Every automated log message should carry as many of these fields as are applicable:

- `timestamp`: ISO 8601 timestamp; render in Asia/Bangkok for humans.
- `environment`: staging / production / other explicit environment.
- `service`: exact originating service or workflow.
- `severity`: critical / error / warning / info.
- `event_type`: stable machine-readable event name.
- `status`: started / succeeded / failed / retried / blocked / cancelled.
- `event_id`, `run_id`, `incident_id`, or `correlation_id`: stable identifiers where available.
- `summary`: short human-readable explanation.
- `source_url`: GitHub run/commit/PR, deployment, task, or dashboard link where available.
- `error_fingerprint`: stable fingerprint for de-duplication when an error occurs.

Use a concise Discord embed with a clear title, environment, severity, summary, and deep link. Do not dump entire payloads into the channel.

## Severity and noise controls

- **P0:** confirmed system-wide outage, active security incident, or confirmed irreversible data loss. Notify `#log-critical-alerts` immediately.
- **P1:** major function unavailable or blocked release requiring prompt intervention. Notify `#log-critical-alerts` and the relevant canonical channel.
- **P2:** recoverable component degradation or job failure with a workaround. Route to `#log-errors` or `#log-warnings`; escalate only if the defined threshold is crossed.
- **P3/info:** ordinary lifecycle and successful events. Route to runtime, jobs, agent, delivery, or digest channels.
- De-duplicate by error fingerprint and environment. Aggregate repeated identical failures (with count and first/last seen) rather than posting an unbounded flood.
- Send recovery/resolution as a distinct event referencing the original incident.
- Do not create a second message for every retry unless a retry changes state or crosses an escalation threshold.

## Implementation gates

Before describing this as live, verify all of the following:

1. Discord categories/channels have been created and their IDs recorded in secure configuration.
2. Bot/webhook permissions are limited to the required channels.
3. Each producer is mapped to a canonical destination; unknown events fail safely and are observable.
4. A staging test proves successful delivery for error, update, commit/deploy, and attachment/evidence paths.
5. A negative test proves that secrets are redacted and duplicate errors are coalesced.
6. End-to-end tests verify both the Discord message and any Unifiend Dashboard/MCP reader that is expected to consume it.

Until those gates pass, the routing above is a proposed contract, not proof of an active logging pipeline.
