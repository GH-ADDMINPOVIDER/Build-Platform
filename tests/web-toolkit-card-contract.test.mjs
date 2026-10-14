import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadTs } from "./_load-ts.mjs";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const card = JSON.parse(read("config/capability-card-stone.json"));
const toolkit = JSON.parse(read("assets/toolkit-manifest.json"));
const core = read("worker/capability-card-stone.ts");
const api = read("worker/capability-card-stone-api.ts");
const aliasResolver = await loadTs("worker/web-toolkit-alias.ts");

test("Web Toolkit is the single canonical CCS card for legacy God Toolkit and Control Tower names", () => {
  assert.equal(card.primary_card.card_id, "web-toolkit");
  assert.equal(card.primary_card.display_name, "Web Toolkit");
  assert.equal(card.primary_card.canonical, true);
  for (const alias of ["OGENIC God Toolkit", "God Toolkit", "Control Tower", "Vercel Agent", "Vercel Sandbox"]) {
    assert.equal(aliasResolver.resolveCanonicalAlias(alias, card.primary_card)?.card_id, "web-toolkit", alias);
  }
  assert.equal(aliasResolver.resolveCanonicalAlias("unrelated admin surface", card.primary_card), null);
  assert.match(core, /resolveCanonicalAlias\(value, ccsConfig\.primary_card\)/);
  assert.equal(toolkit.front_door.canonical_card_id, "web-toolkit");
});

test("Web Toolkit fails closed for paid Vercel usage and missing meters", () => {
  const guard = card.primary_card.cost_guard;
  assert.equal(guard.mode, "ZERO_PAID_SPEND");
  assert.equal(guard.max_paid_spend_usd, 0);
  assert.equal(guard.paid_fallback, false);
  assert.equal(guard.paid_agent_chat, false);
  assert.equal(guard.paid_agent_investigations, false);
  assert.equal(guard.paid_agent_code_reviews, false);
  assert.equal(guard.unknown_usage, "BLOCK");
  assert.equal(guard.unknown_cost, "BLOCK");
  assert.equal(guard.missing_meter_adapter, "BLOCK");
  assert.equal(card.primary_card.safety.fail_closed, true);
  const sandbox = card.primary_card.components.find((component) => component.id === "vercel-sandbox");
  assert.equal(sandbox.enabled, false);
  assert.equal(sandbox.network_default, "deny_all");
  assert.deepEqual(sandbox.exposed_ports, []);
});

test("CCS exposes a protected alias resolver that never executes provider actions", () => {
  assert.match(api, /\/api\/ccs\/resolve/);
  assert.match(api, /resolveWebToolkitAlias\(requestedName\)/);
  assert.match(api, /WEB_TOOLKIT_ALIAS_NOT_FOUND/);
  assert.match(api, /direct_execution_bypass: false/);
  assert.match(api, /fail_closed: true/);
  assert.match(api, /hasOwnerOrOpsAccess/);
});

test("manifest points legacy Toolkit and Control Tower names to the one front door", () => {
  assert.equal(toolkit.front_door.display_name, "Web Toolkit");
  assert.equal(toolkit.front_door.no_duplicate_cards, true);
  assert.equal(toolkit.front_door.unknown_alias, "BLOCK");
  assert.equal(toolkit.front_door.production_promotion, false);
});
