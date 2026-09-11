# OGENIC Control Tower — UX/UI Spec v1.3.0

## Goal
A mobile-first internal control center where the user types one natural-language request and the router chooses the correct capability, tool, connector, and agent automatically.

## Primary interaction
The first screen is centered on one command box:

`Ask OGENIC…`

Automatic routing is the default. Manual category navigation remains available as an optional inspection/control path.

## Information architecture

### Top bar
- OGENIC GOD TOOLKIT v1.3.0
- environment / safety state
- approval inbox
- system/agent health entry

### Hero command
- large natural-language input
- quick chips: Build / Automate / Website / Data / Sales / Media / Status
- route preview after submission

### Capability Index
00 Core / Auto Router
01 Code & Build
02 System & Runtime
03 Automation & Delivery
04 Web / App / Cloudflare
05 Data & Knowledge
06 Business & Sales
07 Communication
08 Security & Credentials
09 Media & Creative
10 Observability & Control

Tapping a category reveals sub-capabilities. The user should never be forced to select a category before asking for an outcome.

### Agents / Connectors
Show execution surfaces with explicit states:
- Ready
- Needs auth
- Rate limited
- Offline
- Unknown

Never show a guessed Ready state.

### Run detail
- original request
- selected route
- execution surfaces selected
- approval state
- step timeline
- verification result
- generated artifacts/links
- retry / rollback controls when supported

### Approval Inbox
Each card shows:
- action
- target
- reason
- risk
- payload summary
- Approve / Reject

### Business & Sales
Tabs:
- Hot Leads
- Warm Leads
- Map
- Pipeline
- Commercial Calculator
- Samples
- Reorders

Lead card:
- intent score
- source/date
- store/location
- exact public signal
- recommended products
- commercial fit
- Analyze / Approve Contact / Watch

### Observability
- current runs
- failures
- queued jobs
- connector health
- observable quota/rate-limit signals
- audit log

## Visual system
- mobile-first
- dark premium control-tower shell
- charcoal/black base
- cream content panels
- light gold active state
- purple-red execution/agent accents
- large tap targets
- compact cards
- route/technical details expandable rather than forced on the first screen

## UX rules
- one primary action per card
- blockers must be explicit; never hide them behind a generic spinner
- distinguish attempted from verified success
- never show secret values
- Human Approval must be visually obvious before consequential actions
- preserve a readable one-handed phone layout
