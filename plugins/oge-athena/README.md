# OGE Athena

Portable plugin package for the OGENIC WAVE read-only Athena MCP bridge.

Connect through the normal OAuth owner-login flow at `https://wave.ogenicchocolate.com/mcp`; do not paste an API token into the plugin manifest.

The server exposes only:
- `oge_athena_snapshot`
- `oge_d1_health`
- `oge_athena_permissions`
- `oge_1lss_sessions`
- `oge_integration_bindings`

The OAuth authorization page reuses the existing WAVE owner sign-in. Access tokens are short-lived; refresh tokens rotate. D1 stores only hashes of authorization codes and tokens. No provider credential is revealed. The connector remains read-only, and Yellow Stone is still the sole execution authority.

**Not yet live:** OAuth source is on a feature branch; the additive migration `0016_oge_athena_oauth.sql` has not been applied and the Worker has not been deployed. Do not attempt to connect until the staging proof and approved staging rollout are complete.

See [the setup and rollout guide](../../docs/integrations/WAVE_REMOTE_MCP_DATA_STONE.md) for the full OAuth sequence and proof requirements.
