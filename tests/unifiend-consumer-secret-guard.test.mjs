import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { bearerCredentialPattern } from "../scripts/unifiend-consumer-secret-guard.mjs";

test("Codex prose diagnostics do not look like bearer credentials", () => {
  for (const message of [
    "Bearer authentication is supported by the CLI.",
    "Bearer authorization and browser session routing are available.",
    "Bearer authenticationrequired and runtime diagnostics.",
    "No Bearer token was transmitted."
  ]) assert.equal(bearerCredentialPattern.test(message), false, "ordinary prose was blocked");
});
test("Credential-shaped Bearer tokens still fail closed", () => {
  for (const marker of [
    "Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signature0123456789",
    "Bearer synthetic123456789abcdefABC98765XYZ",
    "Bearer /synthetic_encoded+token_0123456789=="
  ]) assert.equal(bearerCredentialPattern.test(marker), true, "credential-shaped marker not caught");
});
test("Existing consumer remains guard enforcing, metadata-only and scope limited", () => {
  const source = readFileSync(new URL("../scripts/unifiend-command-consumer.mjs", import.meta.url),"utf8");
  assert.match(source, /\["bearer_token", bearerCredentialPattern\]/);
  assert.match(source, /UNIFIEND_CONSUMER_GUARD_CHANNELS=/);
  assert.match(source, /const status = guarded \? "BLOCKED"/);
  assert.match(source, /CODEX_HOME/);
  assert.match(source, /UNIFIEND_CONSUMER_SAFE_FAILURE=/);
  assert.doesNotMatch(source, /process\.stdout\.write\(combined\)/);
});

test("Owner-pinned Unifiend Terminal uses only original GS Codex profile and cannot switch to GT or TS context", () => {
  const source = readFileSync(new URL("../scripts/unifiend-command-consumer.mjs", import.meta.url), "utf8");
  assert.match(source, /const codexHome = "\/home\/wave\/\.codex"/);
  assert.match(source, /expectedGsIdentityHash/);
  assert.match(source, /claims\.email/);
  assert.match(source, /identityHash !== expectedGsIdentityHash/);
  assert.match(source, /CODEX_GS_PROFILE_NOT_VERIFIED/);
  assert.match(source, /UNIFIEND_CONSUMER_CODEX_IDENTITY=GPT_GS_CODEX/);
  assert.doesNotMatch(source, /const codexHome = configuredCodexHome/);
  assert.doesNotMatch(source, /codexHome = \"\/root\/\.codex\"/);
});
