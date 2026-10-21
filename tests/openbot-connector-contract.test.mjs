import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const runtime = fs.readFileSync(new URL("../worker/connector-runtime.ts", import.meta.url), "utf8");
const api = fs.readFileSync(new URL("../worker/connector-app-api.ts", import.meta.url), "utf8");

test("OpenBot sender is disabled by default and requires server-side URL plus secret", () => {
  assert.match(runtime, /OPENBOT_ENABLED\?: string/);
  assert.match(runtime, /OPENBOT_WEBHOOK_URL\?: string/);
  assert.match(runtime, /OPENBOT_WEBHOOK_SECRET\?: string/);
  assert.match(runtime, /env\.OPENBOT_ENABLED !== "true"/);
  assert.match(runtime, /code: "CONNECTOR_DISABLED"/);
  assert.match(runtime, /code: "CONFIGURATION_REQUIRED"/);
});

test("OpenBot endpoint rejects non-HTTPS URLs and embedded credentials/fragments", () => {
  assert.match(runtime, /parsed\.protocol !== "https:"/);
  assert.match(runtime, /parsed\.username \|\| parsed\.password \|\| parsed\.hash/);
  assert.match(runtime, /code: "INVALID_WEBHOOK_ENDPOINT"/);
});

test("OpenBot signs timestamp.deliveryId.body with HMAC-SHA256 and bounded headers", () => {
  assert.match(runtime, /hmacBytes\(secret, `\$\{timestamp\}\.\$\{deliveryId\}\.\$\{body\}`\)/);
  assert.match(runtime, /"X-OpenBot-Timestamp": timestamp/);
  assert.match(runtime, /"X-OpenBot-Delivery-Id": deliveryId/);
  assert.match(runtime, /"X-OpenBot-Signature": signature/);
  assert.match(runtime, /\}, 5000\)/);
});

test("OpenBot event contains only bounded read-only metadata and never forwards arbitrary prompt text", () => {
  assert.match(runtime, /type: "ogenic\.wave\.readonly_probe"/);
  assert.match(runtime, /task_id: "openbot-readonly-probe"/);
  assert.match(runtime, /task_class: "read_only_status"/);
  assert.match(runtime, /environment: "staging"/);
  assert.doesNotMatch(runtime.slice(runtime.indexOf("async function sendOpenBotReadOnlyProbe"), runtime.indexOf("export async function testConnector")), /prompt|command:|shell|raw_body/i);
});

test("HTTP 202 is EVENT_ACCEPTED only and cannot be reported as a completed run", () => {
  assert.match(runtime, /const accepted = response\.status === 202/);
  assert.match(runtime, /state: accepted \? "EVENT_ACCEPTED" : "DELIVERY_FAILED"/);
  assert.match(runtime, /run_completed: false/);
  assert.match(runtime, /completion_evidence_required: "OpenBot routine history or a documented result callback"/);
});

test("the explicit connector test action remains protected by Owner Session middleware", () => {
  assert.match(api, /api\.use\("\/api\/connectors", ownerOnly\)/);
  assert.match(api, /api\.post\("\/api\/connectors\/test"/);
  assert.match(runtime, /if \(connectorId === "openbot"\) return sendOpenBotReadOnlyProbe\(env\)/);
});
