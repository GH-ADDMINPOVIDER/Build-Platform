import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { build } from "esbuild";
import { prove, permittedRequest, readOnlyD1, READ_QUERIES } from "../scripts/verify-oge-32-read-only.mjs";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const compiled = await build({ entryPoints: [new URL("../worker/verified-function-tools.ts", import.meta.url).pathname], bundle: true, write: false, platform: "node", format: "esm" });
const { executeVerifiedTool, verifiedFunctionTools } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString("base64")}`);

test("server-side proof uses signed auth and only allowlisted reads with safe evidence", async () => {
  const requests = [];
  const env = { GITHUB_REPOSITORY: "Ogenicchocolate21debug/Build-Platform", GITHUB_REF_NAME: "codex/continue-implementation-for-oge-32-dkxg99", GITHUB_SHA: "a".repeat(40), OGENIC_OPS_KEY: "fixture-owner-key", GITHUB_TOKEN: "fixture-github-token", LINEAR_API_KEY: "fixture-linear-key", CLOUDFLARE_API_TOKEN: "fixture-cloudflare-token", CLOUDFLARE_ACCOUNT_ID: "b".repeat(32) };
  const request = async (url, init = {}) => {
    requests.push({ url, method: init.method ?? "GET", body: init.body });
    if (url.endsWith("/api/health")) return Response.json({ ok: true, runtime: "cloudflare", shared_state: "D1_BOUND" });
    if (url.endsWith("/api/session")) {
      if (init.method === "POST") assert.equal(JSON.parse(init.body).owner_key, env.OGENIC_OPS_KEY);
      else assert.equal(init.headers.Cookie, "ogenic_owner_session=fixture-signed-session");
      return Response.json({ authenticated: true, user: { role: "owner" } }, { headers: { "set-cookie": "ogenic_owner_session=fixture-signed-session; HttpOnly; Secure" } });
    }
    if (url.endsWith("/api/dashboard")) return Response.json({ ok: true, runtime: { branch: "phase-vi-provider-incentive-metering", git_sha: "c".repeat(40) } });
    if (url.endsWith("/api/connectors")) return Response.json({ ok: true, connectors: [] });
    if (url.includes("api.cloudflare.com")) {
      const { sql, params } = JSON.parse(init.body);
      assert.ok(READ_QUERIES.has(sql));
      if (sql.includes("chat_messages")) assert.deepEqual(params, ["owner-main", 2]);
      const results = sql.includes("chat_messages") ? [{ role: "user", content: "fixture-github-token", sequence_no: 1 }] : [{}];
      return Response.json({ success: true, result: [{ success: true, results, meta: { rows_written: 0 } }] });
    }
    if (url.includes("api.linear.app")) return Response.json({ data: { issue: { identifier: "OGE-32" }, issues: { nodes: [{ identifier: "OGE-32" }] } } });
    if (url.includes("/contents/")) return Response.json({ type: "file", encoding: "base64", content: Buffer.from("fixture canonical file").toString("base64") });
    if (url.includes("/branches/")) return Response.json({ commit: { sha: "d".repeat(40) } });
    if (url.includes("/actions/runs")) return Response.json({ workflow_runs: [] });
    throw new Error("UNEXPECTED_REQUEST");
  };
  const evidence = await prove({ env, dispatch: executeVerifiedTool, definitions: verifiedFunctionTools, request });
  assert.equal(evidence.result, "PASS");
  assert.equal(Object.keys(evidence.seven_tools).length, 7);
  assert.equal(evidence.write_denial, "HUMAN_APPROVAL_REQUIRED");
  assert.equal(evidence.d1_select_reads, 8);
  assert.equal(evidence.d1_writes, 0);
  assert.equal(evidence.agent_calls, 0);
  assert.ok(!JSON.stringify(evidence).includes("fixture-"));
  assert.ok(requests.every(({ url, method }) => method === "GET" || url.endsWith("/api/session") || url.includes("api.linear.app") || url.includes("api.cloudflare.com")));
  const partial = await prove({ env: { ...env, LINEAR_API_KEY: undefined }, dispatch: executeVerifiedTool, definitions: verifiedFunctionTools, request });
  assert.equal(partial.result, "BLOCKED");
  assert.equal(partial.owner_auth, "PASS");
  assert.equal(partial.seven_tools.linear_get_issue, "BLOCKED_CONFIGURATION_REQUIRED");
  assert.equal(partial.seven_tools.lss_recent_turns, "PASS");
  assert.equal(partial.seven_tools.yellowstone_status, "PASS");
  assert.equal(partial.write_denial, "HUMAN_APPROVAL_REQUIRED");
  assert.equal(permittedRequest("https://wave.ogenicchocolate.com/api/chat/functions", { method: "POST" }), false);
  assert.equal(permittedRequest("https://api.github.com/repos/Ogenicchocolate21debug/Build-Platform/branches/main"), false);
  assert.equal(permittedRequest("https://api.linear.app/graphql", { method: "POST", body: JSON.stringify({ query: "mutation { issueCreate { success } }" }) }), false);
  const db = readOnlyD1(request, env.CLOUDFLARE_ACCOUNT_ID, env.CLOUDFLARE_API_TOKEN, { reads: 0, failures: 0 });
  assert.throws(() => db.prepare("DELETE FROM chat_messages"), /D1_READ_ONLY_ALLOWLIST/);
  await assert.rejects(db.prepare([...READ_QUERIES][0]).run(), /D1_WRITE_FORBIDDEN/);
  await assert.rejects(prove({ env, dispatch: executeVerifiedTool, definitions: verifiedFunctionTools, request: async () => Response.json({}, { status: 401 }) }), /STAGING_HTTP_401/);
});

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
