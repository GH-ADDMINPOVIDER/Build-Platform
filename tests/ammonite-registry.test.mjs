import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const config = JSON.parse(readFileSync(new URL("../config/ammonite-maop-operator-registry.json", import.meta.url), "utf8"));

test("requested powers are not silently granted to unverified cross-account identities", () => {
  assert.equal(config.phase, "STAGING_DESIGN_NOT_LIVE");
  assert.equal(config.identity_is_root_or_host_sudo, false);
  assert.equal(config.certificate_trust.final_yellow_execution_check, true);
  assert.equal(config.actors.length, 11);
  for (const actor of config.actors) {
    assert.deepEqual(actor.granted_capabilities, []);
    assert.equal(actor.certificate_status, "NOT_ISSUED");
    assert.ok(actor.requested_capabilities.includes("BUILD"));
    assert.ok(actor.requested_capabilities.includes("DEPLOY"));
  }
});
test("Github identity is not confused with runtime executor or agent", () => {
  assert.equal(config.actors.find((a) => a.id === "github-secondary").kind, "tool");
  assert.equal(config.actors.find((a) => a.id === "wave-runner-02").readiness, "UNREGISTERED_OR_NOT_VERIFIED");
});
test("no raw credential values or keys are checked into requested-registry config", () => {
  const text = JSON.stringify(config);
  assert.ok(!/(?:sk-proj-|ghp_[A-Za-z0-9]{20}|-----BEGIN PRIVATE KEY-----)/.test(text));
  assert.equal(config.certificate_trust.raw_secret_values_in_certificates, false);
});
