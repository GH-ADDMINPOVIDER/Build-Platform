import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("frontend never embeds or stores OGENIC_OPS_KEY", async () => {
  const app = await read("src/App.tsx");
  assert.doesNotMatch(app, /OGENIC_OPS_KEY/);
  assert.doesNotMatch(app, /sessionStorage|localStorage/);
  assert.doesNotMatch(app, /Authorization:\s*`Bearer/);
  assert.match(app, /credentials: "same-origin"/);
});

test("owner login produces a hardened HTTP-only session cookie", async () => {
  const auth = await read("worker/app-auth.ts");
  assert.match(auth, /HttpOnly; Secure; SameSite=Strict/);
  assert.match(auth, /crypto\.subtle\.sign\("HMAC"/);
  assert.match(auth, /validSignedSession/);
});

test("flattened v0.2 dashboard, tools and tasks routes require owner session", async () => {
  const api = await read("worker/app-api.ts");
  assert.match(api, /api\.use\("\/api\/dashboard", requireProtectedAppRoute\)/);
  assert.match(api, /api\.use\("\/api\/tools", requireProtectedAppRoute\)/);
  assert.match(api, /api\.use\("\/api\/tasks", requireProtectedAppRoute\)/);
  assert.doesNotMatch(api, /api\.use\("\/api\/app\/\*"/);
});

test("live integrations exist only in server-side Worker adapters", async () => {
  const adapters = await read("worker/live-tools.ts");
  const app = await read("src/App.tsx");
  for (const binding of ["GITHUB_TOKEN", "LINEAR_API_KEY", "N8N_API_KEY"]) {
    assert.match(adapters, new RegExp(binding));
    assert.doesNotMatch(app, new RegExp(binding));
  }
  assert.match(adapters, /api\.github\.com/);
  assert.match(adapters, /api\.linear\.app/);
  assert.match(adapters, /\/api\/v1\/workflows/);
});

test("deployment remains locked to the staging feature branch", async () => {
  const workflow = await read(".github/workflows/provider-incentive-staging-deploy.yml");
  const wrangler = await read("wrangler.jsonc");
  assert.match(workflow, /branches: \[phase-vi-provider-incentive-metering\]/);
  assert.match(workflow, /WORKER_NAME: ogenic-phase-vi-staging/);
  assert.match(workflow, /D1_DATABASE_NAME: ogenic-phase-vi-staging/);
  assert.match(wrangler, /phase-vi-provider-incentive-metering/);
  assert.doesNotMatch(workflow, /wrangler deploy[^\n]*--env prod/);
});

test("1LSS is one canonical ordered owner-main line across live chat doors", async () => {
  const entry = await read("worker/entry.ts");
  const modelApi = await read("worker/chat-model-api.ts");
  const liveAssist = await read("worker/live-assist-api.ts");
  const connectorEntry = await read("worker/entry-connectors.ts");
  const desktop = await read("src/ControlPlaneV2.tsx");
  const mobile = await read("src/MobileApp.tsx");
  const migration = await read("database/migrations/0010_1lss_canonical_line.sql");

  assert.match(entry, /SAME_MIND_CONVERSATION_ID = "owner-main"/);
  assert.match(modelApi, /CONVERSATION_ID = "owner-main"/);
  assert.match(liveAssist, /SAME_MIND_CONVERSATION_ID = "owner-main"/);
  assert.match(modelApi, /session_line: "1LSS_OWNER_MAIN"/);
  assert.match(liveAssist, /session_line: "1LSS_OWNER_MAIN"/);

  assert.match(desktop, /fetch\("\/api\/chat\/history"/);
  assert.match(desktop, /body\.messages\.slice\(-60\)/);
  assert.match(mobile, /fetch\("\/api\/chat\/history"/);
  assert.match(connectorEntry, /pathname === "\/api\/chat"/);
  assert.match(connectorEntry, /pathname === "\/api\/chat\/api"/);
  assert.match(connectorEntry, /pathname === "\/api\/chat\/model"/);
  assert.match(connectorEntry, /pathname === "\/api\/1lss\/chat"/);
  assert.match(connectorEntry, /"ogenic-web"/);
  assert.match(connectorEntry, /"chatgpt-dev"/);
  assert.match(connectorEntry, /canonicalChatModelRequest/);

  assert.match(modelApi, /sequence_no/);
  assert.match(modelApi, /source_surface/);
  assert.match(modelApi, /idempotency_key/);
  assert.match(modelApi, /ORDER BY sequence_no DESC, created_at DESC, rowid DESC/);
  assert.match(modelApi, /HISTORY_LIMIT = 60/);
  assert.match(modelApi, /You are Ammonite/);
  assert.match(modelApi, /Temporal references/);
  assert.match(modelApi, /Distinguish "last interaction\/conversation" from "latest project state\/status"/);

  assert.match(liveAssist, /source_surface, idempotency_key/);
  assert.match(liveAssist, /'live-assist'/);
  assert.match(liveAssist, /ORDER BY sequence_no DESC, created_at DESC, rowid DESC/);

  assert.match(migration, /last_sequence INTEGER NOT NULL DEFAULT 0/);
  assert.match(migration, /sequence_no INTEGER/);
  assert.match(migration, /source_surface TEXT NOT NULL DEFAULT 'legacy'/);
  assert.match(migration, /idempotency_key TEXT/);
  assert.match(migration, /ROW_NUMBER\(\) OVER/);
  assert.match(migration, /idx_chat_messages_conversation_sequence/);
  assert.match(migration, /idx_chat_messages_conversation_idempotency/);
});
