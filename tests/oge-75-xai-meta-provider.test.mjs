import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const xai = readFileSync("worker/xai-api.ts", "utf8");
const meta = readFileSync("worker/meta-model-api.ts", "utf8");
const entry = readFileSync("worker/entry-yellow-stone.ts", "utf8");
const registry = readFileSync("worker/blue-diamond-registry.ts", "utf8");
const readiness = readFileSync("worker/provider-readiness.ts", "utf8");
const bindings = JSON.parse(readFileSync("config/staging-runtime-bindings.json", "utf8"));
const providers = JSON.parse(readFileSync("config/providers.json", "utf8"));
const contextPolicy = JSON.parse(readFileSync("config/agent-context-policy.json", "utf8"));

test("OGE-75 keeps xAI and Grok as one canonical provider identity", () => {
  assert.ok(bindings.provider_optional.includes("XAI_API_KEY"));
  assert.ok(bindings.aliases.XAI_API_KEY.includes("GROK_API_KEY"));
  assert.equal(bindings.actor_map.XAI_API_KEY, "grok-candidate");
  assert.match(xai, /https:\/\/api\.x\.ai\/v1\/responses/);
  assert.match(xai, /grok-4\.7/);
  assert.match(xai, /automatic_retry: false/);
  assert.match(xai, /DENIED_WITHIN_ATTEMPT/);
});

test("OGE-75 registers Meta Model API without claiming live readiness", () => {
  assert.ok(bindings.provider_optional.includes("META_MODEL_API_KEY"));
  assert.equal(bindings.actor_map.META_MODEL_API_KEY, "meta-model-candidate");
  assert.ok(providers.providers.some((provider) =>
    provider.id === "meta_model" && provider.status === "optional"
  ));
  assert.match(meta, /https:\/\/api\.meta\.ai\/v1\/responses/);
  assert.match(meta, /muse-spark-1\.3/);
  assert.match(meta, /BOUND_BILLING_UNVERIFIED/);
  assert.match(meta, /automatic_retry: false/);
});

test("OGE-75 routes both providers through the guarded Yellow entry", () => {
  assert.match(entry, /createXaiApi/);
  assert.match(entry, /createMetaModelApi/);
  assert.match(entry, /pathname\.startsWith\("\/api\/xai\/"\)/);
  assert.match(entry, /pathname\.startsWith\("\/api\/meta-model\/"\)/);
});

test("OGE-75 exposes both actors in Blue registry and readiness", () => {
  assert.match(registry, /actor_id: "grok-candidate"/);
  assert.match(registry, /actor_id: "meta-model-candidate"/);
  assert.match(registry, /return actors;/);
  assert.match(readiness, /"meta_model"/);
  assert.match(readiness, /META_MODEL_API_KEY/);
});

test("OGE-75 inherits the global bounded-context policy", () => {
  assert.equal(contextPolicy.scope, "ALL_AGENTS_ALL_PROVIDERS");
  assert.equal(contextPolicy.hard_rules.full_conversation_replay, false);
  assert.equal(contextPolicy.hard_rules.hidden_retry, false);
  assert.equal(contextPolicy.hard_rules.hidden_provider_fallback, false);
  assert.equal(contextPolicy.provider_rules.xai_grok.canonical_secret, "XAI_API_KEY");
  assert.equal(contextPolicy.provider_rules.meta_model.canonical_secret, "META_MODEL_API_KEY");
});
