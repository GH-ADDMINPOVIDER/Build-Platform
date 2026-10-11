import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Discord incident alerts are colored, redacted, and scoped to Discord webhook URLs", async () => {
  const alerts = await read("worker/discord-alerts.ts");
  assert.match(alerts, /SESSION_LOST: 0xed4245/);
  assert.match(alerts, /WORKFLOW_FAILURE: 0xe67e22/);
  assert.match(alerts, /RUNTIME_ERROR: 0x9b59b6/);
  assert.match(alerts, /RECOVERY: 0x2ecc71/);
  assert.match(alerts, /discord\.com", "discordapp\.com/);
  assert.match(alerts, /\/api\/webhooks\//);
  assert.match(alerts, /allowed_mentions: \{ parse: \[\] \}/);
  assert.match(alerts, /never forwards prompts, request bodies, cookies, or credentials/i);
  assert.match(alerts, /DEDUPE_WINDOW_MS = 5 \* 60 \* 1000/);
  assert.match(alerts, /function safeRoute/);
  assert.match(alerts, /function safeCode/);
  assert.doesNotMatch(alerts, /idempotency-key/);
  assert.match(alerts, /DISCORD_WORKFLOW_WEBHOOK_URL/);
  assert.match(alerts, /DISCORD_RUNTIME_WEBHOOK_URL/);
  assert.match(alerts, /DISCORD_STATUS_WEBHOOK_URL/);
});

test("workflow and ATHENA entry points observe responses without changing response bodies", async () => {
  const root = await read("worker/entry.ts");
  const connectors = await read("worker/entry-connectors.ts");
  assert.match(root, /observeDiscordResponse\(env, request, response/);
  assert.match(connectors, /observeDiscordResponse\(env, incomingRequest, response/);
  assert.match(root, /DiscordAlertBindings/);
  assert.match(connectors, /DiscordAlertBindings/);
});
