import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const placement = JSON.parse(readFileSync("config/external-resource-placement.json", "utf8"));
const capabilities = JSON.parse(readFileSync("config/external-resource-capabilities.json", "utf8"));
const providers = JSON.parse(readFileSync("config/providers.json", "utf8"));

test("OGE-72 preserves core authority boundaries", () => {
  assert.equal(capabilities.authority_invariants.primary_runtime, "cloudflare");
  assert.equal(capabilities.authority_invariants.canonical_operational_state, "d1_1lss");
  assert.equal(capabilities.authority_invariants.canonical_source_ci, "github");
  assert.equal(capabilities.authority_invariants.execution_authority, "yellow_maop");
});

test("OGE-72 keeps Vercel optional and non-production", () => {
  const resource = capabilities.resources.vercel;
  assert.equal(resource.provider_status, "optional");
  assert.equal(resource.routing_mode, "explicit_optional");
  assert.ok(resource.capabilities.every((capability) => capability.auto_route === false));
  assert.ok(resource.capabilities.some((capability) => capability.id === "deploy_preview" && capability.production_promotion === false));
});

test("OGE-72 keeps ClickUp fail-closed until a real action surface exists", () => {
  const resource = capabilities.resources.clickup;
  assert.equal(resource.fail_closed, true);
  assert.ok(resource.capabilities.every((capability) => capability.auto_route === false));
  assert.ok(resource.capabilities.every((capability) => capability.adapter_state === "not_exposed_in_current_harness"));
});

test("OGE-72 keeps Notion non-canonical migration/read-only source", () => {
  const resource = capabilities.resources.notion;
  assert.equal(resource.canonical, false);
  assert.equal(resource.provider_status, "migration");
  assert.equal(resource.routing_mode, "migration_or_explicit_read");
});

test("OGE-72 provider registry matches placement roles", () => {
  const byId = Object.fromEntries(providers.providers.map((provider) => [provider.id, provider]));
  assert.equal(byId.vercel.role, "secondary_preview_deploy_observability");
  assert.equal(byId.clickup.role, "external_collaboration_docs_tasks");
  assert.equal(byId.notion.role, "legacy_knowledge_archive_migration");
  assert.equal(byId.cloudflare.role, "primary_runtime");

  const ids = new Set(placement.resources.map((resource) => resource.id));
  assert.ok(ids.has("vercel"));
  assert.ok(ids.has("clickup"));
  assert.ok(ids.has("notion"));
});


test("OGE-125 registers Candy Baked as read-only without promoting Vercel or replacing canonical Drive/Docs", () => {
  const resource = placement.resources.find((item) => item.id === "candybaked_web");
  const capability = JSON.parse(readFileSync("config/external-resource-capabilities.json", "utf8")).resources.candybaked_web;
  assert.ok(resource);
  assert.equal(resource.critical_path, false);
  assert.equal(resource.routing_mode, "owner_explicit_read_only");
  assert.equal(capability.provider_status, "optional");
  assert.equal(capability.canonical, false);
  assert.equal(capability.fail_closed, true);
  assert.ok(capability.capabilities.every((item) => item.auto_route === false));
  assert.equal(capability.authority_invariants.canonical_product_media_and_A1_A6_data, "google_drive_and_canonical_docs");
});
