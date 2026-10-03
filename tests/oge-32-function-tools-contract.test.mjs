import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { build } from "esbuild";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const compiled = await build({ entryPoints: [new URL("../worker/verified-function-tools.ts", import.meta.url).pathname], bundle: true, write: false, platform: "node", format: "esm" });
const { executeVerifiedTool, verifiedFunctionTools } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString("base64")}`);

test("dispatcher rejects consequential actions and secret paths without upstream calls", async () => {
  for (const name of ["http_action", "trigger_n8n_workflow", "github_create_issue", "deploy", "delete"]) {
    assert.equal((await executeVerifiedTool(name, {}, {})).code, "HUMAN_APPROVAL_REQUIRED");
  }
  for (const path of [".env", ".env.production", "config/.env.local", "secrets.json", "credentials.yaml", "private.pem", "id_rsa", "../README.md"]) {
    assert.equal((await executeVerifiedTool("github_fetch_file", { path }, { GITHUB_TOKEN: "synthetic-binding" })).code, "INVALID_TOOL_ARGUMENTS");
  }
  assert.equal((await executeVerifiedTool("github_staging_status", { branch: "main" }, {})).code, "INVALID_TOOL_ARGUMENTS");
  assert.equal((await executeVerifiedTool("lss_recent_turns", { limit: 1, conversation: "other" }, {})).code, "INVALID_TOOL_ARGUMENTS");
  assert.equal((await executeVerifiedTool("yellowstone_status", {}, {})).code, "CONFIGURATION_REQUIRED");
  assert.equal(verifiedFunctionTools.length, 7);
});

test("live dispatch locks reads, sanitizes provider output, and contains upstream failures", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  const queries = [];
  const env = {
    GITHUB_TOKEN: "synthetic-github-binding",
    LINEAR_API_KEY: "synthetic-linear-binding",
    DB: { prepare(sql) {
      assert.match(sql, /^SELECT /);
      queries.push(sql);
      return { bind(conversation, limit) { assert.equal(conversation, "owner-main"); assert.equal(limit, 2); return this; }, async all() { return { results: sql.includes("chat_messages") ? [{ content: "password=synthetic-password Bearer synthetic-bearer", api_key: "synthetic-private", sequence_no: 2 }] : [] }; } };
    } },
  };
  try {
    globalThis.fetch = async (url, init = {}) => {
      requests.push({ url, method: init.method ?? "GET", body: init.body });
      if (url.includes("/contents/")) return Response.json({ type: "file", encoding: "base64", content: Buffer.from('สวัสดี synthetic-github-binding\npassword="synthetic-password"\n-----BEGIN PRIVATE KEY-----\nsynthetic-pem\n-----END PRIVATE KEY-----').toString("base64") });
      if (url.includes("api.linear.app")) return Response.json({ data: { issue: { identifier: "OGE-32", title: "synthetic-linear-binding", secret: "synthetic-private", description: "sk-synthetic123456789" } } });
      if (url.includes("/branches/")) return Response.json({ commit: { sha: "fixture-sha" }, protected: true });
      return Response.json({ workflow_runs: [] });
    };
    for (const [name, args] of [["github_staging_status", {}], ["github_fetch_file", { path: "README.md" }], ["linear_recent_issues", { limit: 2 }], ["linear_get_issue", { identifier: "OGE-32" }], ["lss_recent_turns", { limit: 2 }], ["yellowstone_status", {}], ["ogenic_system_status", {}]]) {
      const result = await executeVerifiedTool(name, args, env);
      assert.equal(result.ok, true);
      assert.equal(result.read_only, true);
      const output = JSON.stringify(result);
      for (const secret of [env.GITHUB_TOKEN, env.LINEAR_API_KEY, "synthetic-password", "synthetic-bearer", "synthetic-private", "synthetic-pem", "sk-synthetic123456789"]) assert.ok(!output.includes(secret));
      if (name === "github_fetch_file") assert.match(result.data.content, /สวัสดี/);
      if (name === "lss_recent_turns") assert.equal(result.data.session, "1LSS_OWNER_MAIN");
    }
    assert.ok(requests.filter(({ url }) => url.includes("api.github.com")).every(({ url, method }) => method === "GET" && url.includes("Ogenicchocolate21debug/Build-Platform") && url.includes("phase-vi-provider-incentive-metering")));
    assert.ok(requests.filter(({ method }) => method === "POST").every(({ body }) => !body.includes("mutation")));
    assert.ok(queries.some(sql => sql.includes("WHERE conversation_id = ?")));
    globalThis.fetch = async () => { throw new Error("synthetic-github-binding"); };
    assert.deepEqual(await executeVerifiedTool("github_staging_status", {}, env), { ok: false, code: "UPSTREAM_READ_FAILED", verified: false, read_only: true });
  } finally { globalThis.fetch = originalFetch; }
});

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
