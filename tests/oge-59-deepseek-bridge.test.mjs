import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const api = readFileSync("worker/deepseek-api.ts", "utf8");
const entry = readFileSync("worker/entry-yellow-stone.ts", "utf8");
const smoke = readFileSync("scripts/deepseek-smoke.mjs", "utf8");
const bindings = JSON.parse(readFileSync("config/staging-runtime-bindings.json", "utf8"));
const deploy = readFileSync(".github/workflows/provider-incentive-staging-deploy.yml", "utf8");
const pkg = JSON.parse(readFileSync("package.json", "utf8"));

test("OGE-59 normalizes existing Infisical aliases to canonical provider keys", () => {
  assert.ok(bindings.aliases.PERPLEXITY_API_KEY.includes("API_PERLEXITY"));
  assert.ok(bindings.aliases.DEEPSEEK_API_KEY.includes("Api_deepseek_key_operate_1"));
  assert.ok(bindings.provider_optional.includes("PERPLEXITY_API_KEY"));
  assert.ok(bindings.provider_optional.includes("DEEPSEEK_API_KEY"));
});

test("OGE-59 exposes a guarded one-pass DeepSeek reasoning lane", () => {
  assert.match(api, /hasOwnerSession/);
  assert.match(api, /DEEPSEEK_API_KEY\?: string/);
  assert.match(api, /https:\/\/api\.deepseek\.com\/chat\/completions/);
  assert.match(api, /deepseek-flash/);
  assert.match(api, /deepseek-v4-pro/);
  assert.match(api, /DEEPSEEK_RATE_LIMITED/);
  assert.match(api, /automatic_retry: false/);
  assert.match(api, /YELLOW_STONE_ONLY/);
  assert.doesNotMatch(api, /Api_deepseek_key_operate_1|DEEPSEEK_KEY/);
});

test("OGE-59 routes DeepSeek and keeps smoke output secret-safe", () => {
  assert.match(entry, /createDeepSeekApi/);
  assert.match(entry, /pathname\.startsWith\("\/api\/deepseek\/"\)/);
  assert.equal(pkg.scripts["deepseek:smoke"], "node scripts/deepseek-smoke.mjs");
  assert.match(smoke, /thinking: \{ type: "disabled" \}/);
  assert.match(smoke, /max_tokens: 64/);
  assert.match(smoke, /content_present/);
  assert.doesNotMatch(smoke, /process\.stdout\.write\(key|console\.log\(key/);
});

test("billing-deferred providers stay off unrelated staging deploy critical path", () => {
  assert.match(deploy, /Paid provider live smoke deferred by owner/);
  assert.match(deploy, /DeepSeek and Perplexity live smoke are billing-deferred by owner/);
  assert.doesNotMatch(deploy, /npm run --silent deepseek:smoke/);
  assert.doesNotMatch(deploy, /npm run --silent perplexity:smoke/);
  assert.doesNotMatch(deploy, /OGENIC_READINESS_DEEPSEEK_API=REACHABLE/);
  assert.doesNotMatch(deploy, /OGENIC_READINESS_PERPLEXITY_API=REACHABLE/);
});
