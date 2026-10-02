import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("OGE-32 registers exactly the seven strict read-only private tools", async () => {
  const source = await read("worker/verified-function-tools.ts");
  const names = ["ogenic_system_status", "github_staging_status", "github_fetch_file", "linear_recent_issues", "linear_get_issue", "lss_recent_turns", "yellowstone_status"];
  for (const name of names) assert.match(source, new RegExp(`name: "${name}"`));
  assert.equal((source.match(/name: "(?:ogenic_system_status|github_staging_status|github_fetch_file|linear_recent_issues|linear_get_issue|lss_recent_turns|yellowstone_status)"/g) ?? []).length, 7);
  assert.equal((source.match(/type: "function", name: .* strict: true/g) ?? []).length, 7);
  assert.match(source, /additionalProperties: false/);
  assert.doesNotMatch(source, /name: "(?:connector_status|list_recent_hook_events|http_action|trigger_n8n_workflow)"/);
});

test("private tool bridge locks canonical resources and fails writes closed", async () => {
  const source = await read("worker/verified-function-tools.ts");
  assert.match(source, /Ogenicchocolate21debug\/Build-Platform/);
  assert.match(source, /phase-vi-provider-incentive-metering/);
  assert.match(source, /CANONICAL_CONVERSATION = "owner-main"/);
  assert.match(source, /CANONICAL_SESSION = "1LSS_OWNER_MAIN"/);
  assert.match(source, /HUMAN_APPROVAL_REQUIRED/);
  assert.match(source, /INVALID_TOOL_ARGUMENTS/);
  assert.match(source, /\[REDACTED\]/);
  assert.doesNotMatch(source, /process\.env/);
  assert.match(source, /api\.github\.com\/repos\/\$\{CANONICAL_REPOSITORY\}/);
  assert.match(source, /api\.linear\.app\/graphql/);
  assert.match(source, /WHERE conversation_id = \?/);
});

test("Responses loop uses verified dispatcher while Browser MCP remains separate", async () => {
  const bridge = await read("worker/connector-app-api.ts");
  const browser = await read("worker/browser-session-api.ts");
  assert.match(bridge, /verifiedFunctionTools/);
  assert.match(bridge, /executeVerifiedTool/);
  assert.match(bridge, /type: "function_call_output"/);
  assert.match(bridge, /for \(let round = 0; round < 4/);
  assert.match(bridge, /Browser MCP is an independent inspection lane/);
  assert.match(browser, /puppeteer/);
});
