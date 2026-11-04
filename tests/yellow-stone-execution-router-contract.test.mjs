import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("Yellow Stone execution endpoint reuses deterministic resolver and owner/ops auth", () => {
  const source = read("worker/capability-execution-api.ts");
  assert.match(source, /hasOwnerOrOpsAccess/);
  assert.match(source, /readResolverCandidates/);
  assert.match(source, /resolveCapability\(request, candidates\)/);
  assert.match(source, /\/api\/capabilities\/execute/);
  assert.doesNotMatch(source, /new URL\(.*body/i);
});

test("safe READ runs; unsupported non-read adapters are explicit with no approval prompt", () => {
  const source = read("worker/capability-execution-api.ts");
  assert.match(source, /descriptor\.permission_class !== "READ"/);
  assert.match(source, /ADAPTER_NOT_IMPLEMENTED/);
  assert.match(source, /NO_IMPLEMENTED_NON_READ_ADAPTER/);
  assert.match(source, /hasOwnerSession\(c\.req\.raw, c\.env\)/);
  assert.match(source, /ADAPTER_NOT_IMPLEMENTED/);
  assert.match(source, /NO_SAFE_READ_ADAPTER_FOR_RESOLVED_CAPABILITY/);
});

test("initial concrete adapter is staging-scoped GitHub read_file with secret guards", () => {
  const source = read("worker/capability-execution-api.ts");
  const resolver = read("worker/capability-resolver-api.ts");
  assert.match(resolver, /\('github', 'read_file', 11\)/);
  assert.match(source, /descriptor\.provider_id !== "github" \|\| descriptor\.capability_id !== "read_file"/);
  assert.match(source, /CANONICAL_STAGING_BRANCH = "Unified-on-Progress"/);
  assert.match(source, /INVALID_OR_SENSITIVE_PATH/);
  assert.match(source, /CONTENT_REDACTED_SECRET_LIKE/);
  assert.doesNotMatch(source, /secret_ref/);
});

test("verified READ result writes compact evidence to canonical 1LSS and remains idempotent", () => {
  const source = read("worker/capability-execution-api.ts");
  assert.match(source, /CANONICAL_CONVERSATION = "owner-main"/);
  assert.match(source, /CANONICAL_SESSION_LINE = "1LSS_OWNER_MAIN"/);
  assert.match(source, /source_surface, idempotency_key/);
  assert.match(source, /'external-harness'/);
  assert.match(source, /YELLOW_STONE VERIFIED READ/);
  assert.match(source, /ONE_LSS_PERSIST_FAILED/);
  assert.match(source, /verification\("verified"/);
});

test("Yellow Stone entry exposes resolve and execute without replacing the base Worker", () => {
  const source = read("worker/entry-yellow-stone.ts");
  assert.match(source, /pathname === "\/api\/capabilities\/resolve"/);
  assert.match(source, /pathname === "\/api\/capabilities\/execute"/);
  assert.match(source, /resolverApi\.fetch/);
  assert.match(source, /executionApi\.fetch/);
  assert.match(source, /base\.fetch/);
  assert.match(source, /base\.scheduled/);
});
