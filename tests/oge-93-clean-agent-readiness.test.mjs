import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const registry = readFileSync("worker/blue-diamond-registry.ts", "utf8");
const attested = JSON.parse(readFileSync("config/provider-readiness-attestations.json", "utf8"));
const roster = JSON.parse(readFileSync("config/unifiend-phase-ii-agent-roster.json", "utf8"));

test("OGE-93 marks only HTTP-verified DeepSeek and Gemini as bounded READ specialists", () => {
  for (const name of ["deepseek", "gemini"]) {
    assert.equal(attested.providers[name]?.verification_state, "VERIFIED");
    assert.equal(attested.providers[name]?.http_status, 200);
  }
  assert.match(registry, /function geminiReadVerified/);
  assert.match(registry, /function deepseekLiveVerified/);
  assert.match(registry, /state: geminiReadVerified\(env\) \? "LIVE" : configured/);
  assert.match(registry, /state: deepseekLiveVerified\(env\) \? "LIVE" : configured/);
  assert.match(registry, /OGENIC_READINESS_GEMINI_QUOTA === "AVAILABLE"/);
  assert.match(registry, /OGENIC_READINESS_DEEPSEEK_BILLING === "ACTIVE"/);
  assert.equal(roster.specialists.find((x) => x.id === "deepseek")?.auto_route, false);
});

test("OGE-93 preserves unverified candidate/bridge labels and never invents paid availability", () => {
  for (const name of ["perplexity", "anthropic", "xai", "meta_model"]) {
    assert.equal(attested.providers[name], undefined);
  }
  assert.match(registry, /actor_id: "perplexity-candidate"/);
  assert.match(registry, /actor_id: "meta-model-candidate"/);
  assert.match(registry, /actor_id: "manus-candidate"/);
  assert.match(registry, /state: "BRIDGE_ONLY"/);
});
