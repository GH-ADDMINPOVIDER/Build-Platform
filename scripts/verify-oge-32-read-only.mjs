import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const REPO = "Ogenicchocolate21debug/Build-Platform";
const HEAD_BRANCH = "codex/continue-implementation-for-oge-32-dkxg99";
const BRANCH = "phase-vi-provider-incentive-metering";
const STAGING = "https://wave.ogenicchocolate.com";
const DATABASE = "b4ac3a33-df80-47cf-8e75-7574e025b87b";
export const TOOL_NAMES = ["ogenic_system_status", "github_staging_status", "github_fetch_file", "linear_recent_issues", "linear_get_issue", "lss_recent_turns", "yellowstone_status"];

// Exact dispatcher SELECT statements only. No arbitrary SQL, PRAGMA, batches, or mutations.
export const READ_QUERIES = new Set([
  "SELECT role, content, model, created_at, sequence_no, source_surface FROM chat_messages WHERE conversation_id = ? ORDER BY sequence_no DESC, created_at DESC LIMIT ?",
  "SELECT key, value FROM system_meta ORDER BY key LIMIT 60",
  "SELECT id, name, phase, status, entrypoint, control_plane, runtime_provider, database_provider, version, updated_at FROM toolkits ORDER BY updated_at DESC LIMIT 20",
  "SELECT id, ordinal, name, description, status, source_id, updated_at FROM system_planes ORDER BY ordinal LIMIT 40",
  "SELECT id, scope, rule_text, enforcement, enabled, source_id, updated_at FROM policy_rules WHERE enabled = 1 ORDER BY scope, id LIMIT 80",
  "SELECT provider_id, environment, binding_type, status, last_checked_at FROM provider_bindings ORDER BY provider_id, environment LIMIT 100",
  "SELECT id, provider_id, title, source_kind, status, precedence, migration_status, source_last_edited_at, updated_at FROM canonical_sources ORDER BY precedence, id LIMIT 80",
  "SELECT id, project_id, source_id, title, substr(body, 1, 2200) AS body, format, canonical, source_last_edited_at, updated_at FROM knowledge_documents ORDER BY canonical DESC, updated_at DESC LIMIT 10",
]);

export function permittedRequest(rawUrl, init = {}) {
  const url = new URL(rawUrl);
  const method = init.method ?? "GET";
  if (url.protocol !== "https:" || url.username || url.password) return false;
  if (url.origin === STAGING) return (method === "GET" && ["/api/health", "/api/session", "/api/dashboard", "/api/connectors"].includes(url.pathname)) || (method === "POST" && url.pathname === "/api/session");
  if (url.origin === "https://api.github.com" && method === "GET") {
    return (url.pathname === `/repos/${REPO}/branches/${BRANCH}` && !url.search) ||
      (url.pathname === `/repos/${REPO}/actions/runs` && url.searchParams.get("branch") === BRANCH) ||
      (url.pathname === `/repos/${REPO}/contents/README.md` && url.searchParams.get("ref") === BRANCH);
  }
  if (url.origin === "https://api.linear.app" && url.pathname === "/graphql" && method === "POST") {
    const body = JSON.parse(init.body ?? "{}");
    return ["query RecentIssues($first: Int!) { issues(first: $first, orderBy: updatedAt) { nodes { identifier title url updatedAt state { name } assignee { name } } } }", "query Issue($identifier: String!) { issue(id: $identifier) { identifier title description url updatedAt priority state { name } assignee { name } labels { nodes { name } } } }"].includes(body.query) && (body.variables?.identifier === "OGE-32" || body.variables?.first === 2);
  }
  return false;
}

export function readOnlyD1(request, account, token, counters) {
  assert.match(account, /^[a-f0-9]{32}$/i);
  return { prepare(sql) {
    assert.ok(READ_QUERIES.has(sql), "D1_READ_ONLY_ALLOWLIST");
    let params = [];
    return { bind(...values) {
      assert.ok(sql.includes("WHERE conversation_id = ?"));
      assert.deepEqual(values, ["owner-main", 2]);
      params = values;
      return this;
    }, async all() {
      try {
        const response = await request(`https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/${DATABASE}/query`, {
          method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ sql, params }), signal: AbortSignal.timeout(15000),
        });
        const body = await response.json();
        assert.ok(response.ok && body.success === true && body.result?.length === 1 && body.result[0].success === true, "D1_READ_FAILED");
        assert.ok(!body.result[0].meta?.rows_written, "D1_WRITE_DETECTED");
        counters.reads++;
        return { results: body.result[0].results ?? [] };
      } catch { counters.failures++; throw new Error("D1_READ_FAILED"); }
    }, async run() { throw new Error("D1_WRITE_FORBIDDEN"); } };
  } };
}

export async function prove({ env, dispatch, definitions, request = fetch }) {
  assert.equal(env.GITHUB_REPOSITORY, REPO);
  assert.equal(env.GITHUB_REF_NAME, HEAD_BRANCH);
  assert.match(env.GITHUB_SHA, /^[a-f0-9]{40}$/);
  const required = ["OGENIC_OPS_KEY", "CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"];
  for (const name of required) assert.ok(env[name], `MISSING_BINDING_${name}`);
  assert.deepEqual(definitions.map(tool => tool.name), TOOL_NAMES);
  // Credential values only: *_SECRET_PATH and *_SECRET_ENV_SLUG are configuration,
  // not credentials. Treating '/' or 'staging' as a secret would reject safe evidence.
  const secrets = Object.entries(env).filter(([key, value]) => /(?:_secret|_token|_key|_password|_cookie)$/i.test(key) && typeof value === "string" && value.length).map(([, value]) => value);
  const noLeak = (value) => { const text = JSON.stringify(value); assert.ok(secrets.every(secret => !text.includes(secret)), "SECRET_LEAK_DETECTED"); assert.doesNotMatch(text, /Bearer\s+[A-Za-z0-9._~+/=-]+|gh[pousr]_[A-Za-z0-9_]+|sk-[A-Za-z0-9_-]{12,}|-----BEGIN [^-]*PRIVATE KEY-----/i); };
  const guarded = async (url, init = {}) => { assert.ok(permittedRequest(url, init), "NETWORK_READ_ONLY_ALLOWLIST"); return request(url, { ...init, signal: init.signal ?? AbortSignal.timeout(15000) }); };
  const json = async (url, init) => { const response = await guarded(url, init); assert.ok(response.ok, `STAGING_HTTP_${response.status}_${new URL(url).pathname.replaceAll("/", "_")}`); return { response, body: await response.json() }; };
  const { body: health } = await json(`${STAGING}/api/health`);
  assert.ok(health.ok && health.runtime === "cloudflare" && health.shared_state === "D1_BOUND");
  const login = await json(`${STAGING}/api/session`, { method: "POST", headers: { "Content-Type": "application/json", Origin: STAGING }, body: JSON.stringify({ owner_key: env.OGENIC_OPS_KEY }) });
  assert.ok(login.body.authenticated && login.body.user?.role === "owner");
  const cookie = login.response.headers.get("set-cookie")?.match(/ogenic_owner_session=([^;]+)/)?.[1];
  assert.ok(cookie, "OWNER_SESSION_MISSING");
  secrets.push(cookie);
  const headers = { Cookie: `ogenic_owner_session=${cookie}` };
  const { body: session } = await json(`${STAGING}/api/session`, { headers });
  assert.ok(session.authenticated && session.user?.role === "owner");
  const { body: dashboard } = await json(`${STAGING}/api/dashboard`, { headers });
  assert.ok(dashboard.ok && dashboard.runtime?.branch === BRANCH, "STAGING_CANONICAL_BRANCH_MISMATCH");
  const { body: connectors } = await json(`${STAGING}/api/connectors`, { headers });
  assert.ok(connectors.ok && Array.isArray(connectors.connectors));
  const counters = { reads: 0, failures: 0 };
  const bindings = { GITHUB_TOKEN: env.GITHUB_TOKEN, LINEAR_API_KEY: env.LINEAR_API_KEY, DB: readOnlyD1(request, env.CLOUDFLARE_ACCOUNT_ID, env.CLOUDFLARE_API_TOKEN, counters), OGENIC_GIT_SHA: env.GITHUB_SHA, OGENIC_RUNTIME: "github-actions-read-only-proof", OGENIC_PHASE: "VI" };
  const args = [{}, {}, { path: "README.md" }, { limit: 2 }, { identifier: "OGE-32" }, { limit: 2 }, {}];
  const checks = {};
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = guarded;
    for (let index = 0; index < TOOL_NAMES.length; index++) {
      const name = TOOL_NAMES[index];
      const result = await dispatch(name, args[index], bindings);
      noLeak(result);
      if (!result.ok || !result.read_only || !result.verified) {
        const code = ["CONFIGURATION_REQUIRED", "UPSTREAM_READ_FAILED", "FILE_NOT_READABLE", "FILE_DECODE_FAILED"].includes(result.code) ? result.code : "ACCEPTANCE_CHECK_FAILED";
        checks[name] = `BLOCKED_${code}`;
        continue;
      }
      const data = result.data;
      try {
      if (name === "github_staging_status") assert.ok(data.repository === REPO && data.branch === BRANCH && /^[a-f0-9]{40}$/.test(data.head_sha));
      if (name === "github_fetch_file") assert.ok(data.repository === REPO && data.branch === BRANCH && data.path === "README.md" && data.content.length > 0);
      if (name === "linear_recent_issues") assert.ok(data.issues?.nodes?.length > 0);
      if (name === "linear_get_issue") assert.equal(data.issue?.identifier, "OGE-32");
      if (name === "lss_recent_turns") assert.ok(data.conversation === "owner-main" && data.session === "1LSS_OWNER_MAIN" && data.turns.length > 0);
      if (name === "yellowstone_status") assert.ok(data.state === "LIVE" && data.counts.toolkits > 0 && data.counts.policies > 0 && counters.reads === READ_QUERIES.size && counters.failures === 0);
      checks[name] = "PASS";
      } catch { checks[name] = "BLOCKED_ACCEPTANCE_CHECK_FAILED"; }
    }
    const before = counters.reads;
    const denied = await dispatch("github_create_issue", {}, bindings);
    assert.equal(denied.code, "HUMAN_APPROVAL_REQUIRED");
    assert.equal(denied.ok, false);
    assert.equal(counters.reads, before);
    noLeak(denied);
  } finally { globalThis.fetch = originalFetch; }
  const evidence = { result: Object.values(checks).every(status => status === "PASS") ? "PASS" : "BLOCKED", checked_at: new Date().toISOString(), repository: REPO, canonical_branch: BRANCH, conversation: "owner-main", session: "1LSS_OWNER_MAIN", source_sha: env.GITHUB_SHA, execution_surface: "GitHub-hosted Node dispatcher against live staging providers and read-only D1 adapter", worker_deployment_performed: false, worker_deployed_source_sha: /^[a-f0-9]{40}$/.test(dashboard.runtime?.git_sha) ? dashboard.runtime.git_sha : null, owner_auth: "PASS", binding_availability: Object.fromEntries(["OGENIC_OPS_KEY", "GITHUB_TOKEN", "LINEAR_API_KEY", "CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"].map(name => [name, Boolean(env[name])])), seven_tools: checks, write_denial: "HUMAN_APPROVAL_REQUIRED", secret_leak_check: "PASS", d1_select_reads: counters.reads, d1_writes: 0, agent_calls: 0 };
  noLeak(evidence);
  return evidence;
}

async function main() {
  let evidence;
  try {
    const compiled = await build({ entryPoints: ["worker/verified-function-tools.ts"], bundle: true, write: false, platform: "node", format: "esm", logLevel: "silent" });
    const tools = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString("base64")}`);
    // Pin the adapter to the checked-out repository's existing staging D1 configuration.
    const config = await readFile("wrangler.jsonc", "utf8");
    assert.ok(config.includes('"database_name": "ogenic-phase-vi-staging"') && config.includes(`"database_id": "${DATABASE}"`));
    evidence = await prove({ env: process.env, dispatch: tools.executeVerifiedTool, definitions: tools.verifiedFunctionTools.filter(tool => TOOL_NAMES.includes(tool.name)) });
    if (evidence.result !== "PASS") process.exitCode = 1;
  } catch (error) {
    const reason = String(error?.message ?? "").split("\n")[0];
    const safe = /^(?:MISSING_BINDING_[A-Z_]+|STAGING_HTTP_[0-9]{3}_[a-z_]+|TOOL_PROOF_FAILED_[a-z_]+|OWNER_SESSION_MISSING|D1_READ_FAILED|D1_WRITE_DETECTED|NETWORK_READ_ONLY_ALLOWLIST|SECRET_LEAK_DETECTED)$/;
    evidence = { result: "BLOCKED", code: safe.test(reason) ? reason : "AUTH_BINDING_OR_READ_PROOF_FAILED", secret_values_logged: false };
    process.exitCode = 1;
  }
  await mkdir("oge-32-proof", { recursive: true });
  await writeFile("oge-32-proof/verification.json", JSON.stringify(evidence, null, 2) + "\n", { mode: 0o600 });
  console.log(`OGE_32_READ_ONLY_PROOF=${evidence.result}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
