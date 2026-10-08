import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { adapter, planMoliFetch, runMoliSmoke } from "../integrations/moli/read-only-smoke.mjs";
const code = (p) => readFileSync(p, "utf8");
const sha = "a".repeat(40);
const binary = "/tmp/ogenic-moli/bin/moli";

test("Moli is a version/SHA-pinned optional Yellow Browser tool, not a plugin or Chrome replacement", () => {
  assert.equal(adapter.name, "Moli");
  assert.equal(adapter.lane, "YELLOW_BROWSER_TOOL");
  assert.equal(adapter.release_sha256, "c003600e22a450914ff804cd980eeac6d37495c9e88f8786bf75d00d010171d0");
  assert.equal(adapter.pinned_version, "v1.1.12");
  assert.equal(adapter.browser_automation_api_active, false);
  assert.equal(adapter.existing_plugin_and_mcp_routes_unchanged, true);
  assert.equal(adapter.cloud_browser_runtime_unchanged, true);
  assert.equal(adapter.paid_lexmount_cloud, false);
  assert.equal(adapter.installed_persistently, false);
});
test("Only exact HTTPS public test page is executable from optional smoke", () => {
  const p = planMoliFetch({ url: "https://example.com/", sourceSha: sha, binary });
  assert.deepEqual(p.args, ["fetch", "--dump", "markdown", "--wait-until", "done", "https://example.com/"]);
  for (const url of [
    "http://example.com/", "https://example.com/private", "https://example.com/?secret=1",
    "https://127.0.0.1/", "https://169.254.169.254/", "https://example.com@internal/",
    "https://example.com:8443/", "file:///etc/passwd", "https://example.net/",
    "https://example.com/#secret"
  ]) assert.throws(() => planMoliFetch({ url, sourceSha: sha, binary }), url);
  assert.throws(() => planMoliFetch({ url: "https://example.com/", sourceSha: "bad", binary }));
  assert.throws(() => planMoliFetch({ url: "https://example.com/", sourceSha: sha, binary: "moli" }));
});
test("Successful browser smoke records hashes and no secrets or side effects", () => {
  const p = planMoliFetch({ url: "https://example.com/", sourceSha: sha, binary });
  let calls = 0;
  const result = runMoliSmoke(p, (cmd, args, options) => {
    calls++;
    assert.equal(cmd, binary);
    assert.equal(args[0], "fetch");
    assert.ok(options.timeout <= 45000);
    assert.equal(options.env.OPENAI_API_KEY, undefined);
    assert.equal(options.env.MANUS_API_KEY, undefined);
    return "# Example Domain\nThis domain is for use in illustrative examples.";
  });
  assert.equal(calls, 1);
  assert.equal(result.ok, true);
  assert.equal(result.schema, "OGE95_MOLI_BROWSER_SMOKE_V1");
  assert.match(result.content_sha256, /^[0-9a-f]{64}$/);
  assert.equal(result.llm_calls, 0);
  assert.equal(result.paid_cloud_sessions, 0);
  assert.equal(result.ruby_verification, "PENDING");
  assert.doesNotMatch(JSON.stringify(result), /illustrative examples/);
});
test("Missing proof text never returns fake PASS", () => {
  const p = planMoliFetch({ url: "https://example.com/", sourceSha: sha, binary });
  assert.throws(() => runMoliSmoke(p, () => "<html>authentication error</html>"), /MOLI_PUBLIC_CONTENT_MISMATCH/);
});
test("Yellow exposes only authenticated discovery, no direct website execution route", () => {
  const entry = code("worker/entry-yellow-stone.ts");
  const api = code("worker/moli-browser-api.ts");
  assert.match(entry, /createMoliBrowserApi/);
  assert.match(entry, /pathname === "\/api\/moli\/status"/);
  assert.match(api, /hasOwnerOrOpsAccess/);
  assert.match(api, /api\.get\("\/api\/moli\/status"/);
  assert.doesNotMatch(api, /api\.post\(/);
  const browser = code("worker/browser-session-api.ts");
  assert.match(browser, /cloudflare_browser_run/);
});
