import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync(new URL("../src/WavePolicy.tsx", import.meta.url), "utf8");
const app = readFileSync(new URL("../src/main.tsx", import.meta.url), "utf8");
const landing = readFileSync(new URL("../src/Landing.tsx", import.meta.url), "utf8");

test("public policy route is connected to the existing WAVE app and visible on the landing page", () => {
  assert.match(app, /policyRoute/);
  assert.match(app, /<WavePolicy\s*\/>/);
  assert.match(landing, /href="\/policy"/);
});

test("public statement discloses essential control and verification boundaries", () => {
  for (const expected of ["Yellow Stone", "Owner", "Infisical", "MCP", "SHA-256", "NOT VERIFIED", "PARTIAL", "revocation", "retention"]) {
    assert.ok(page.toLowerCase().includes(expected.toLowerCase()), "Missing: " + expected);
  }
  assert.match(page, /not government-issued certificates/);
});

test("public source does not embed canonical private evidence or credential material", () => {
  assert.doesNotMatch(page, /SSH_PRIVATE_KEY|WAVE_RUNNER_01_SSH_PRIVATE_KEY|cert-manager-89-qe|b4ac3a33-df80/);
  assert.doesNotMatch(page, /9d3d2525ed20bbe00ee0765e222d6e4fd876e62f9575943be9d7f08f3de80cc5/);
});
