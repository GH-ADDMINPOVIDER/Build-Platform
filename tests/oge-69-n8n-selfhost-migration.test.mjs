import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL("../" + path, import.meta.url), "utf8");
const catalog = JSON.parse(read("config/n8n-legacy-migration.json"));
const api = read("worker/n8n-migration-api.ts");
const bindings = JSON.parse(read("config/staging-runtime-bindings.json"));
const lab = read("src/MaopLab.tsx");

test("recovered n8n assets are split into eight explicit migration categories", () => {
  assert.equal(catalog.schema_version, "N8N_LEGACY_MIGRATION_V1");
  assert.equal(catalog.categories.length, 8);
  assert.deepEqual(
    catalog.categories.map((row) => row.id),
    ["core", "ai", "business_domains", "connectors", "governance", "secrets", "delivery", "demo_archive"],
  );
  assert.equal(catalog.control_plane.execution_authority, "YELLOW_STONE_ONLY");
  assert.equal(catalog.control_plane.verification_authority, "RUBY_STONE");
  assert.equal(catalog.control_plane.n8n_role, "EXECUTION_ADAPTER_NOT_CONTROL_PLANE");
});

test("preferred self-host import reference is the 95-node test-ready orchestrator", () => {
  const preferred = catalog.sources.find((row) => row.decision === "PREFERRED_IMPORT_REFERENCE");
  assert.equal(preferred?.id, "orchestrator-95");
  assert.equal(preferred?.node_count, 95);
  assert.equal(preferred?.sha256_prefix, "ec9a955cb6f76959");
});

test("credential audit is quarantined and secret values never enter migration catalog", () => {
  const quarantined = catalog.sources.find((row) => row.kind === "credential_audit");
  assert.equal(quarantined?.decision, "QUARANTINE_NEVER_COMMIT_OR_IMPORT");
  const serialized = JSON.stringify(catalog);
  assert.doesNotMatch(serialized, /sk-proj-|sk-ant-|github_pat_|ghp_|Bearer\s+[A-Za-z0-9._-]{20,}/);
  assert.match(serialized, /NO_RAW_SECRET_IN_GIT/);
  assert.match(serialized, /USE_INFISICAL_OR_RUNTIME_CREDENTIAL_BINDING/);
});

test("self-host destination uses separate runtime bindings from dead legacy cloud source", () => {
  assert.ok(bindings.connector_optional.includes("N8N_SELFHOST_BASE_URL"));
  assert.ok(bindings.connector_optional.includes("N8N_SELFHOST_API_KEY"));
  assert.match(api, /N8N_SELFHOST_BASE_URL/);
  assert.match(api, /N8N_SELFHOST_API_KEY/);
  assert.match(api, /\/api\/n8n\/migration\/selfhost\/status/);
  assert.match(api, /\/healthz/);
});

test("MA-OP Web Lab exposes category map and self-host readiness without import or execution", () => {
  assert.match(lab, /\/api\/n8n\/migration\/catalog/);
  assert.match(lab, /\/api\/n8n\/migration\/selfhost\/status/);
  assert.match(lab, /Open category map/);
  assert.match(lab, /Check self-host/);
  assert.match(api, /workflow_import_allowed: false/);
  assert.match(api, /workflow_execution_allowed: false/);
});
