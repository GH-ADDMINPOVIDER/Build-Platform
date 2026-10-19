import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("WAVE evidence policy documents status semantics and links from landing", async () => {
  const [policy, landing] = await Promise.all([
    readFile(new URL("../public/policy.html", import.meta.url), "utf8"),
    readFile(new URL("../src/Landing.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(policy, /duplicate marker/i);
  assert.match(policy, /NOT VERIFIED/);
  assert.match(policy, /Source ≠ CI ≠ Runtime ≠ E2E/);
  assert.match(policy, /ไม่ใช่ใบรับรอง X\.509/);
  assert.match(policy, /ไม่ใช่เอกสารที่รัฐบาลออกให้/);
  assert.match(policy, /signed_capability_grant = false/);
  assert.match(policy, /External WAVE endpoint mTLS/);
  assert.match(policy, /Owner-confirmed command execution/);
  assert.match(landing, /href="\/policy\.html"/);
  assert.doesNotMatch(policy, /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/);
});
