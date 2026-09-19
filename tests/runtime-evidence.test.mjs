import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("Cloudflare Builds injects commit and build identity into Worker runtime", () => {
  const pkg = JSON.parse(read("package.json"));
  assert.match(pkg.scripts["cf:deploy:staging"], /WORKERS_CI_COMMIT_SHA/);
  assert.match(pkg.scripts["cf:deploy:staging"], /WORKERS_CI_BUILD_UUID/);
  assert.match(pkg.scripts["cf:deploy:staging"], /OGENIC_GIT_SHA/);
});

test("Worker exposes version metadata binding and canonical context includes live runtime evidence", () => {
  const wrangler = read("wrangler.jsonc");
  const context = read("worker/d1-context.ts");
  assert.match(wrangler, /"version_metadata"/);
  assert.match(wrangler, /CF_VERSION_METADATA/);
  assert.match(context, /LIVE_RUNTIME_EVIDENCE/);
  assert.match(context, /worker_version_id/);
});

test("Ammonite and connector supervisor receive live runtime evidence", () => {
  const chat = read("worker/chat-model-api.ts");
  const connector = read("worker/connector-app-api.ts");
  assert.match(chat, /OGENIC_GIT_SHA/);
  assert.match(chat, /CF_VERSION_METADATA/);
  assert.match(connector, /OGENIC_BUILD_UUID/);
  assert.match(connector, /LIVE RUNTIME EVIDENCE/);
});
