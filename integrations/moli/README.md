# Moli Browser Tool — Optional Yellow Stone capability (OGE-95)

**Owner direction, 2026-10-08:** Add **Moli** for Browser Automation **without moving or replacing** any OGENIC system. Keep existing Cloudflare Browser Run session, Plugin/MCP, GitHub, Manus/OpenAI, Runtime ×10, Stone Runner, Ruby, Yellow and 1LSS.

## Source / license

- Official open-source project: https://github.com/lexmount/moli (dual MIT / Apache-2.0; separate third-party component notices may apply).
- Pinned release: **v1.1.12**, x86_64 Linux GNU prebuilt; archive SHA-256 recorded in `config/moli-browser-adapter.json` from the official GitHub release API. Binary is extracted to a temporary directory per CI run, never installed as a permanent system service or downloaded via `curl | sh`.
- No Lexmount Cloud account or credit is needed for the **local** binary. Existing hosting/CI compute still has a cost depending on resource quotas.
- Moli supports CLI `moli fetch` and optional CDP/WebDriver server. This integration enables only a tightly scoped **public read smoke** and metadata discovery; login, posting, orders, payments, site modifications and arbitrary internet navigation are **not** enabled.

## In OGENIC

`ATHENA -> YELLOW STONE capability discovery -> STONE RUNNER existing wave-runner-01 -> Moli read-only CLI -> Ruby-checkable evidence -> Green/1LSS only if separately verified`.

Current implementation:
- `GET /api/moli/status`: owner/ops authenticated, metadata only, through existing `worker/entry-yellow-stone.ts`; no execution or API-key exposure. **Cloudflare Workers do NOT execute Moli native Rust binaries.**
- `integrations/moli/read-only-smoke.mjs`: invoke the locally pinned binary by absolute path, restricted to `https://example.com/`, output sanitized JSON and SHA, with no API/model credentials forwarded.
- `tests/oge95-moli-browser-tool.test.mjs`: URL/SSRF input reject tests, JSON contract, exact expected public content, no authority escape, existing Cloudflare Browser Run untouched.
- `.github/workflows/oge95-moli-browser-proof.yml`: isolated self-hosted `wave-runner-01` job, pinned SHA-256 verified archive download, CLI smoke, receipt in GitHub artifacts; **no credentials, no push/deploy, no D1 mutation**.

## IMPORTANT readiness levels

1. `REGISTERED` means discovery code exists. Does **not** mean Moli is installed on Unifiend's Cloudflare Worker or accessible as an Agent automation route.
2. `BROWSER_SMOKE_PASS` is established only by a completed GitHub Actions CI run, on an exact SHA.
3. General browser sessions/actions require a future **authorized Yellow capability invocation** with egress allowlist, DNS/IP and redirects SSRF protections, state isolation, task budget, rate limits, and human approval for side effects. Never expose an unauthenticated `moli serve` port, or redirect arbitrary requests into the CLI.
4. For screenshots or complex/Canvas/WebGL UI, use existing Chrome/Cloudflare Browser Run if it is a better fit; Moli is an optional lightweight browser tool, not a browser-monoculture migration.

No new OGE issue, cloud subscription, extra VM, database, secrets or live deployment. Keep Product #2 and the existing final-audit topology intact.
