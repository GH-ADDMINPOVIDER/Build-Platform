# WAVE Remote MCP + n8n Data Stone bridge (staging)

This is a staging-only code contract for connecting Manus as an MCP client to WAVE and letting n8n push URL/image/file intake records into ATHENA / White Diamond.

## Endpoints after an approved staging deploy

- POST /mcp — MCP Streamable HTTP JSON-RPC endpoint for Manus.
- POST /hooks/n8n/data-stone — bearer-authenticated ingress for n8n normalized intake events.
- GET /api/wave-bridge/status — owner/ops-only readiness report. It exposes booleans/status only, never secrets.

The public base URL must be the authorized WAVE staging Worker origin. Do not point Manus at the production/custom domain unless a staging deployment explicitly authorizes that target.

## Required server-side bindings

Configure these as Worker secrets outside Git, not in wrangler.jsonc, D1, chat, issues, logs, or this file:

- WAVE_MANUS_MCP_TOKEN: bearer token for the Manus MCP client.
- WAVE_N8N_HOOK_TOKEN: separate bearer token for the n8n push hook.
- WAVE_MCP_ALLOWED_ORIGINS: optional comma-separated origins for browser clients; server-to-server Manus calls should normally omit Origin. The endpoint also allows its own origin.

Use distinct high-entropy values. Never reuse OGENIC_OPS_KEY, Discord credentials, or provider API keys. The existing DB binding is reused; no new D1 table or memory database is introduced. The connector health probe accepts the existing N8N_SELFHOST_BASE_URL binding as well as N8N_BASE_URL, so the known staging variable-name mismatch no longer suppresses the configured host. A live API probe still requires N8N_API_KEY on the WAVE Worker.

## Manus as the MCP middleman: connect two servers separately

Do not turn WAVE into a proxy for all Cloudflare account operations. Add two custom MCP servers in Manus:

1. **Cloudflare tools:** `https://mcp.cloudflare.com/mcp`. Use the official Cloudflare authorization flow in Manus and grant only the scope required for the task. This is the Cloudflare-owned server, separate from WAVE code; never copy its credential into WAVE, n8n, GitHub, or chat.
2. **OGENIC WAVE tools:** the approved HTTPS WAVE **staging Worker** URL ending in `/mcp`, authenticated with `WAVE_MANUS_MCP_TOKEN`. Do not use the public custom domain unless the owner explicitly approves that deployment target.

Manus can then use Cloudflare's native MCP tools and WAVE's task-specific Data Stone tools in the same agent session. n8n is the event producer and posts to `/hooks/n8n/data-stone`; it does not need a second control plane or a new memory database. Verify each MCP server's own connection test in Manus; a WAVE status response alone does not prove the separate Cloudflare MCP server is connected.

## Manus MCP client setup

After the staging Worker has been approved and deployed, configure Manus to connect to the full URL ending in /mcp with bearer authentication using WAVE_MANUS_MCP_TOKEN. The bridge supports the current stateless MCP revision 2026-07-28 discovery/protocol headers and retains a legacy initialize handshake for older clients. Browser-origin requests are denied unless same-origin or explicitly listed in WAVE_MCP_ALLOWED_ORIGINS. The server advertises:

- wave_bridge_status
- wave_intake_add
- wave_intake_list
- wave_intake_read
- wave_intake_ack

wave_intake_read returns actual MCP image/file content only when bytes were stored in an existing WAVE attachment row. URL-only entries return MEDIA_BYTES_NOT_STORED; the tool never equates a URL or filename with a successful image read.

## n8n workflow contract

The existing n8n workflow can POST a normalized JSON item to /hooks/n8n/data-stone with:

- Authorization: Bearer <WAVE_N8N_HOOK_TOKEN>
- Idempotency-Key: <stable-source-event-id> (recommended)
- Content-Type: application/json

Payload fields: source (wave, discord, n8n, or manus), kind (url, image, or file), optional title, note, url, attachment_ref, mime_type, and optional data_url (data:<mime>;base64,...). For actual image bytes, n8n must transfer the binary as data_url or send an existing WAVE att_... reference. The Worker does not fetch remote URLs, to avoid SSRF and signed-link leakage.

## WAVE Chat auto-intake

The existing authenticated WAVE Chat path now calls the intake helper after the user's request is confirmed in the canonical 1LSS prewrite and before the model/agent is dispatched:

- Up to four existing `att_...` attachment references are registered in Data Stone.
- Up to eight pasted HTTPS links are registered as URL references.
- The caller's idempotency key supplies a stable per-turn prefix so retries do not create duplicate inbox items.
- The helper records only compact metadata/reference and does not copy the raw chat prompt, URL query values, or media bytes into logs. Intake failures are logged as sanitized error codes and do not break the main chat turn.
- Image bytes are read through MCP only when the referenced WAVE attachment still exists and passes MIME/byte-count checks. A URL by itself remains `URL_REFERENCE_ONLY`.

This makes ordinary WAVE Chat submissions feed the temporary inbox automatically. n8n can independently push Discord/photo events through its authenticated ingress endpoint below.

## Temporary storage and limits

- Metadata uses the existing connector_events and connector_hook_dedup tables.
- Actual base64 media, if sent, uses the existing chat_attachments table with canonical conversation owner-main.
- Per-item TTL is five minutes. Expired items are excluded immediately; byte rows owned by Data Stone are physically removed on the next bridge cleanup pass. This repo change does not install a background cron, so it does not claim byte deletion at the exact expiry second while the Worker is idle.
- Maximum incoming media is 4 MB. Larger files report a storage/size error; no R2 availability is inferred.
- URL-only or existing-attachment-reference intake does not claim the bytes were fetched or read. Existing WAVE attachments are not deleted early by Data Stone because their lifecycle is owned by the original upload path.

## Verification gates

Automated tests should prove Worker routing (including run_worker_first for /mcp), separate bearer gates, MCP initialize/tools/call, idempotency, signed URL rejection, actual image-byte read and integrity check, five-minute expiry/cleanup, and fail-closed size/mime checks.

Live integration is NOT complete until the tokens are provisioned server-side, the n8n workflow is configured to call the ingress, the Manus MCP connection is added, and a staging execution shows one image's bytes returned by wave_intake_read. Do not deploy, activate n8n, change production, change D1 schema, or touch Candy as part of this PR.
