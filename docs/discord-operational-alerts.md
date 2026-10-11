# Discord operational alerts

The Build-Platform worker can post redacted incident embeds to Discord. Configure these as **server-side secrets** in the Cloudflare Worker environment; never put webhook URLs in source control or chat.

- `DISCORD_ALERTS_WEBHOOK_URL`: fallback webhook for any alert category.
- `DISCORD_STATUS_WEBHOOK_URL`: session-loss and recovery events.
- `DISCORD_WORKFLOW_WEBHOOK_URL`: failed or blocked workflow runs.
- `DISCORD_RUNTIME_WEBHOOK_URL`: HTTP 5xx and runtime/API failures.

Category-specific URLs fall back to the generic alert URL. The receiver must be a Discord webhook URL on `discord.com` or `discordapp.com` under `/api/webhooks/`.

## Embed colors

- Red (`#ED4245`): session lost / re-auth required.
- Orange (`#E67E22`): workflow failure.
- Purple (`#9B59B6`): runtime or API error.
- Green (`#2ECC71`): recovery after a previously observed incident on the same route.

## Redaction and delivery

The notifier sends only the event category, HTTP status, stable error code, route, timestamp, and request/idempotency reference. It never forwards prompts, request bodies, cookies, authorization headers, or secret values. Mentions are disabled. Delivery is best-effort and must not change the response returned to the caller.

Duplicate suppression and recovery tracking are per worker isolate and last five minutes. This is a best-effort guard, not a durable global incident ledger; use a D1-backed incident table before relying on cross-isolate suppression for high-volume production alerting.

After configuring the webhook secrets, test a session expiry, a failed workflow, a 5xx response, and recovery. A source-code change or a successful build alone does not prove that Discord delivery works.
