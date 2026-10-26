import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(path, "utf8");

test("canonical GitHub identities and credential references are explicit", () => {
  const binding = read("scripts/oge34-github-worker-binding.mjs");
  const ccs = read("docs/CCS_AUTHORITY_CONTRACT.md");
  const cert = read("docs/operations/CERTIFICATE_LINCENC_ACCESS.md");
  assert.match(binding, /runner1: \{ id: 306097555, login: "ogenicchocolate21debug" \}/);
  assert.match(binding, /runner2: \{ id: 342175560, login: "wave-runner-2" \}/);
  assert.match(binding, /GH-ID-TOMLOAD-RUNNER-2/);
  assert.match(binding, /GIT_HUB_RUNNER-2/);
  assert.match(ccs, /Wave-Runner-2/);
  assert.doesNotMatch(ccs, /Wave_Runner-2/);
  assert.match(cert, /306097555/);
  assert.match(cert, /342175560/);
  assert.match(cert, /GH-ID-TOMLOAD-RUNNER-2/);
  assert.match(cert, /GH_ADDMINPROVIDER_ID_TOMLOAD21-2.*NOT_CANONICAL/s);
});

test("identity contract keeps certificate access read-only and references existing bindings", () => {
  const certSource = read("worker/certificate-lincenc-registry.ts");
  const athena = read("worker/athena-chat-api.ts");
  const bindings = read("config/staging-runtime-bindings.json");
  assert.match(certSource, /FROM certificate_lincenc WHERE certificate_id = \? LIMIT 1/);
  assert.doesNotMatch(certSource, /CREATE TABLE|INSERT INTO|UPDATE certificate_lincenc/);
  assert.match(athena, /certificate_lincenc_status/);
  assert.match(bindings, /OPENAI_EXECUTOR_API_KEY/);
  assert.match(bindings, /GITHUB_TOKEN/);
});
