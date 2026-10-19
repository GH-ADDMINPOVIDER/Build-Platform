import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const api = fs.readFileSync(new URL("../worker/connector-modes-api.ts", import.meta.url), "utf8");
const entry = fs.readFileSync(new URL("../worker/entry-yellow-stone.ts", import.meta.url), "utf8");

test("connector modes endpoint exposes the complete OGE-130 inventory without secret values", () => {
  const modes = [
    "MCP", "n8n", "REST_API", "TOKEN", "SECRET", "CREDENTIAL", "REPOSITORY_API_PR_API",
    "AGENT_API", "FUNCTION_TOOL_CALLING", "NPX_NPX_CLI", "NPM", "SDK", "A2A_AGENT_RELAY",
    "WEBHOOK_EVENT_CALLING", "AGENT_SIGN_COMMAND_RUN",
  ];
  assert.match(api, /\/api\/connector-modes\/status/);
  assert.match(api, /modes_documented: modes\.length/);
  assert.match(api, /full_e2e_proven: false/);
  assert.match(api, /provider_write_execution_performed: false/);
  assert.doesNotMatch(api, /console\.log\([^\n]*(?:TOKEN|SECRET|API_KEY|password)/i);
  for (const mode of modes) assert.match(api, new RegExp(`mode: "${mode}"`));
  assert.equal((api.match(/mode: "/g) || []).length, 15);
});

test("yellow-stone entry wires the owner-protected status endpoint", () => {
  assert.match(entry, /createConnectorModesApi/);
  assert.match(entry, /pathname\.startsWith\("\/api\/connector-modes\/"\)/);
});

