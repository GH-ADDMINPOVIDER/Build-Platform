import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL("../" + path, import.meta.url), "utf8");
const api = read("worker/n8n-migration-api.ts");
const entry = read("worker/entry-yellow-stone.ts");
const lab = read("src/MaopLab.tsx");

test("n8n legacy bridge is owner-gated and API read-only", () => {
  assert.match(api, /hasOwnerOrOpsAccess/);
  assert.match(api, /X-N8N-API-KEY/);
  assert.match(api, /N8N_CLOUD_PUBLIC_API_READ_ONLY/);
  assert.match(api, /workflow_execution_allowed: false/);
  assert.match(api, /workflow_mutation_allowed: false/);
  assert.doesNotMatch(api, /method:\s*"POST"|method:\s*"PUT"|method:\s*"PATCH"|method:\s*"DELETE"/);
});

test("n8n workflow metadata excludes raw parameters and credential identifiers", () => {
  assert.match(api, /node_parameters_returned: false/);
  assert.match(api, /credential_ids_returned: false/);
  assert.match(api, /credential_names_returned: false/);
  assert.match(api, /credential_secrets_returned: false/);
  assert.doesNotMatch(api, /return\s+workflow\.nodes/);
});

test("known legacy workflow is tracked for preservation", () => {
  assert.match(api, /iJVOGWcwMj8x7u9S/);
  assert.match(api, /preserve_before_rebuild: true/);
  assert.match(api, /destination_required_for_import: true/);
});

test("canonical worker and MA-OP lab expose the n8n migration source", () => {
  assert.match(entry, /createN8nMigrationApi/);
  assert.match(entry, /pathname\.startsWith\("\/api\/n8n\/migration"/);
  assert.match(lab, /\/api\/n8n\/migration\/status/);
});
