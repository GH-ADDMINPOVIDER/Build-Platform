import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("Yellow Stone resolver API is owner/ops gated and read-only", () => {
  const source = read("worker/capability-resolver-api.ts");
  assert.match(source, /hasOwnerOrOpsAccess/);
  assert.match(source, /\/api\/capabilities\/resolve/);
  assert.match(source, /read_only: true/);
  assert.match(source, /NO_PROVIDER_SIDE_EFFECTS/);
  assert.match(source, /D1 binding DB/);
  assert.doesNotMatch(source, /INSERT\s+INTO/i);
  assert.doesNotMatch(source, /UPDATE\s+/i);
  assert.doesNotMatch(source, /DELETE\s+FROM/i);
});

test("resolver API queries only non-secret provider metadata", () => {
  const source = read("worker/capability-resolver-api.ts");
  assert.match(source, /provider_capabilities/);
  assert.match(source, /provider_bindings/);
  assert.doesNotMatch(source, /SELECT[^`]*secret_ref/is);
  assert.doesNotMatch(source, /secret_ref/);
});

test("deployed-entry wrapper only intercepts resolver path and delegates everything else", () => {
  const source = read("worker/entry-yellow-stone.ts");
  assert.match(source, /pathname === "\/api\/capabilities\/resolve"/);
  assert.match(source, /resolverApi\.fetch/);
  assert.match(source, /base\.fetch/);
  assert.match(source, /base\.scheduled/);
});
