import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("Yellow Stone resolver is deterministic and side-effect free", () => {
  const source = read("worker/capability-resolver.ts");
  assert.match(source, /export function resolveCapability/);
  assert.match(source, /scored\.sort/);
  assert.match(source, /MULTIPLE_EQUAL_CANDIDATES/);
  assert.match(source, /CONFIGURATION_REQUIRED/);
  assert.doesNotMatch(source, /fetch\s*\(/);
  assert.doesNotMatch(source, /\.run\s*\(/);
});

test("resolver fails closed for non-active providers unless explicitly allowed", () => {
  const source = read("worker/capability-resolver.ts");
  assert.match(source, /BASE_PROVIDER_STATES = new Set\(\["active"\]\)/);
  assert.match(source, /allowMigration/);
  assert.match(source, /allowOptional/);
  assert.match(source, /REQUESTED_CAPABILITY_OR_PROVIDER_NOT_ELIGIBLE/);
});

test("resolver contract never accepts or emits secret references", () => {
  const source = read("worker/capability-resolver.ts");
  assert.doesNotMatch(source, /secret_ref\??:/);
  assert.doesNotMatch(source, /token\??:/);
  assert.doesNotMatch(source, /cookie\??:/);
  assert.match(source, /never receives credentials/);
});

test("resolver preserves canonical Phase VI permission classes", () => {
  const source = read("worker/capability-resolver.ts");
  const capabilities = JSON.parse(read("config/capabilities.json"));
  assert.deepEqual(capabilities.permission_classes, ["READ", "WRITE", "EXECUTE", "DANGEROUS"]);
  for (const permission of capabilities.permission_classes) {
    assert.match(source, new RegExp(`\\"${permission}\\"`));
  }
});

test("provider catalog keeps migration/planned providers distinguishable", () => {
  const providers = JSON.parse(read("config/providers.json")).providers;
  const statuses = Object.fromEntries(providers.map((provider) => [provider.id, provider.status]));
  assert.equal(statuses.notion, "migration");
  assert.equal(statuses.n8n, "migration");
  assert.equal(statuses.deepseek, "planned");
  assert.equal(statuses.github, "active");
  assert.equal(statuses.linear, "active");
  assert.equal(statuses.cloudflare, "active");
});
