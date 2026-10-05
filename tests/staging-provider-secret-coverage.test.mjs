import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

function registryKeys(source) {
  const keys = new Set();
  for (const match of source.matchAll(/has\(env,\s*"([A-Z0-9_]+)"\)/g)) keys.add(match[1]);
  for (const match of source.matchAll(/configured\(env,\s*\[([^\]]+)\]\)/g)) {
    for (const key of match[1].matchAll(/"([A-Z0-9_]+)"/g)) keys.add(key[1]);
  }
  return keys;
}

test("staging secret manifest covers every env-backed Blue/White runtime binding", async () => {
  const manifest = JSON.parse(await read("config/staging-runtime-bindings.json"));
  const blue = await read("worker/blue-diamond-registry.ts");
  const white = await read("worker/white-diamond-registry.ts");
  const declared = new Set([
    ...manifest.required,
    ...manifest.provider_optional,
    ...manifest.connector_optional,
  ]);
  const expected = new Set([...registryKeys(blue), ...registryKeys(white)]);
  for (const key of expected) {
    assert.ok(declared.has(key), `${key} is used by a runtime registry but missing from staging-runtime-bindings.json`);
  }
});

test("model/provider bindings are explicitly allowlisted and mapped to Blue actors", async () => {
  const manifest = JSON.parse(await read("config/staging-runtime-bindings.json"));
  const requiredProviders = {
    OPENAI_API_KEY: "athena-command",
    OPENAI_EXECUTOR_API_KEY: "codex-execution-agent",
    MANUS_API_KEY: "manus-candidate",
    PERPLEXITY_API_KEY: "perplexity-candidate",
    DEEPSEEK_API_KEY: "deepseek-candidate",
    ANTHROPIC_API_KEY: "claude-candidate",
    GEMINI_API_KEY: "gemini-candidate",
    XAI_API_KEY: "grok-candidate",
  };
  for (const [key, actor] of Object.entries(requiredProviders)) {
    assert.ok([...manifest.required, ...manifest.provider_optional].includes(key), `${key} missing from provider allowlist`);
    assert.equal(manifest.actor_map[key], actor);
  }
});

test("staging deployment loads the manifest, never prints values, and verifies configured actors", async () => {
  const workflow = await read(".github/workflows/oge-36-staging-cloud-fallback.yml");
  assert.match(workflow, /config\/staging-runtime-bindings\.json/);
  assert.match(workflow, /expected_actor_ids/);
  assert.match(workflow, /x-ogenic-ops-key/);
  assert.match(workflow, /SERVER_SIDE_REFERENCE_PRESENT/);
  assert.match(workflow, /values not printed/);
  assert.match(workflow, /Deploy staging Worker without D1 schema changes/);
  assert.doesNotMatch(workflow, /wrangler d1 migrations apply/);
});
