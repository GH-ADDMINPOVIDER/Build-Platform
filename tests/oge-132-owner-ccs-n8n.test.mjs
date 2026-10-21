import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const read=(p)=>fs.readFileSync(new URL("../"+p,import.meta.url),"utf8");
const chat=read("src/UnifiedChat.tsx"),runtime=read("worker/connector-runtime.ts"),modes=read("worker/connector-modes-api.ts"),workflow=read(".github/workflows/provider-incentive-staging-deploy.yml");
test("Owner can submit a single signed /OG.RUN from WAVE Chat without model or double confirmation",()=>{
  assert.match(chat,/ownerProtocol\(prompt\)/);
  assert.ok(chat.includes("MODES|STATUS|MODE|PROBE|RUN|EXECUTE|COMMAND"));
  assert.match(chat,/runOwnerProtocol\(ogMatch\[1\]/);
  assert.match(chat,/runWaveCommand\(arg\.trim\(\)\)/);
  assert.match(chat,/toolMode === "command"\) await runWaveCommand/);
  assert.match(chat,/\["manus", "live", "command"\]/);
  assert.match(chat,/OWNER RUN/);
  assert.doesNotMatch(chat,/confirmWaveCommand/);
});
test("Owner can query all fifteen modes, one mode, and bounded MCP/n8n probes without executing side effects",()=>{
  assert.match(chat,/\/api\/connector-modes\/status\?probe=1/);
  assert.match(chat,/\/api\/connector-endpoint\/v1\/probe\?/);
  assert.match(chat,/\/OG\.MODES/);
  assert.match(chat,/\/OG\.PROBE n8n/);
  assert.match(chat,/e2e_evidence/);
  assert.match(modes,/modes_documented: modes\.length/);
});
test("n8n self-host gets its own credential and is preferred over paused legacy cloud",()=>{
  assert.match(runtime,/N8N_SELFHOST_BASE_URL\?: string/);
  assert.match(runtime,/N8N_SELFHOST_API_KEY\?: string/);
  assert.match(runtime,/const base = selfhostBase \|\| safeBaseUrl\(env\.N8N_BASE_URL\)/);
  assert.match(runtime,/usingSelfhost \? env\.N8N_SELFHOST_API_KEY : env\.N8N_API_KEY/);
  assert.match(runtime,/N8N_SELFHOST_API_KEY_UNBOUND/);
  assert.match(workflow,/N8N_SELFHOST_BASE_URL:/);
  assert.match(modes,/configured\.has\("N8N_SELFHOST_BASE_URL"\)/);
});
