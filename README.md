# OGENIC GOD TOOLKIT v1.3.0

Portable Agent Plugin + Skill and MCP Control Tower for evidence-based capability routing, Human Approval classification, and verified status reporting. Legacy `/WF.*` Developer System-Bootstrap Ops workflows remain available during migration.

## Components

- `plugin.json` — portable Agent Plugins manifest
- `.codex-plugin/plugin.json` — Codex compatibility manifest
- `skills/ogenic-god-toolkit/` — single-entry routing and approval contract
- `apps/ogenic-control-tower/` — Streamable HTTP MCP server and MCP Apps UI
- `scripts/validate_toolkit.py` — package and migration-parity validator

## Pipeline

`Intent → Route → Approval gate → Execute on an authorized surface → Verify → Result`

The MVP MCP tools are read-only planning/status/rendering tools. Execution surfaces stay `unknown` until a live adapter verifies them. This repository stores no plaintext secret values and must never report an unverified deployment, connector, or send as successful.
