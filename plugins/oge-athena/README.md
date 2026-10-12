# OGE Athena

Portable plugin package for the OGENIC WAVE read-only Athena MCP bridge.

## What it exposes

- Worker SHA/version provenance
- D1 per-table query health and row counts
- Blue Diamond's declared actor capabilities and policy boundary
- sanitized staging provider bindings
- stored `owner-main / 1LSS_OWNER_MAIN` session references

It does not expose write/execute tools and never returns provider secrets.

## Prerequisites

The endpoint is not usable until the MCP route is merged, deployed to the staging Worker, and a separate `OGENIC_MCP_READ_TOKEN` secret has been provisioned through the existing staging secret manager. This package contains no token.

Endpoint: `https://wave.ogenicchocolate.com/mcp`

## Claude

Add a remote custom connector at the endpoint URL. Configure a fixed request header:

- Header: `Authorization`
- Value: `Bearer <OGENIC_MCP_READ_TOKEN>`

Only enable the read-only tools you need.

## ChatGPT / Codex

`mcp.json` declares the portable Agent Plugin MCP configuration. Hosts that support this manifest's API-key/bearer authentication can prompt for the token during connection setup. OpenAI's direct ChatGPT **Add custom MCP server** UI currently documents OAuth, no-auth, and mixed auth, but not a fixed API-key input. Connecting through that UI requires a separate OAuth server; this package does not pretend that OAuth is already configured.

See [the integration guide](../../docs/integrations/WAVE_REMOTE_MCP_DATA_STONE.md) for exact semantics, security boundaries, and proof requirements.
