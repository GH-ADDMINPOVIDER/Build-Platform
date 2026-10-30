import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as bindingApi from "../scripts/oge34-github-worker-binding.mjs";

const read = path => readFileSync(path, "utf8");

test("canonical GitHub identities and credential references are explicit", () => {
  const binding = read("scripts/oge34-github-worker-binding.mjs");
  const ccs = read("docs/CCS_AUTHORITY_CONTRACT.md");
  const cert = read("docs/operations/CERTIFICATE_LINCENC_ACCESS.md");
  const isolation = read(".github/workflows/oge-40-github-token-isolation.yml");
  assert.match(binding, /store: \{ id: 306097555, login: "ogenicchocolate21debug" \}/);
  assert.match(binding, /capability: \{ id: 342175560, login: "wave-runner-2" \}/);
  assert.match(binding, /CANONICAL_GITHUB_CREDENTIAL = "GH_ADDMINPROVIDER"/);
  assert.match(binding, /"GH_ADDMINPROVIDER": \{ type: "PAT"/);
  assert.match(ccs, /Wave-Runner-2/);
  assert.doesNotMatch(ccs, /Unifiend_Runner-2/);
  assert.match(cert, /306097555/);
  assert.match(cert, /342175560/);
  assert.match(cert, /GH_ADDMINPROVIDER/);
  assert.deepEqual(
    bindingApi.selectRunnerTwoAuthorizedCredential([
      { key: "GH_ADDMINPROVIDER_EXACT", type: "PAT", principal: "wave-runner-2" },
    ]).key,
    "GH_ADDMINPROVIDER_EXACT",
  );
  assert.equal(bindingApi.selectRunnerTwoAuthorizedCredential([
    { key: "RETIRED_STORE_CREDENTIAL_EXACT", type: "LEGACY", principal: "ogenicchocolate21debug" },
  ]), null);
  assert.equal(bindingApi.inspectRunnerTwoCredential("GH_ADDMINPROVIDER", "ghp_testValue").valid, true);
  assert.equal(bindingApi.inspectRunnerTwoCredential("GH_ADDMINPROVIDER", "github_pat_testValue").valid, true);
  assert.match(isolation, /GH_ADDMINPROVIDER/);
  assert.doesNotMatch(isolation, /RETIRED_STORE_CREDENTIAL/);
});

test("identity contract keeps certificate access read-only and references existing bindings", () => {
  const certSource = read("worker/certificate-lincenc-registry.ts");
  const athena = read("worker/athena-chat-api.ts");
  const bindings = read("config/staging-runtime-bindings.json");
  assert.match(certSource, /FROM certificate_lincenc WHERE certificate_id = \? LIMIT 1/);
  assert.match(certSource, /identity_migration_20261026/);
  assert.doesNotMatch(certSource, /CREATE TABLE|INSERT INTO|UPDATE certificate_lincenc/);
  assert.match(athena, /certificate_lincenc_status/);
  assert.match(bindings, /OPENAI_EXECUTOR_API_KEY/);
  assert.match(bindings, /GITHUB_TOKEN/);
  assert.match(bindings, /GH_ADDMINPROVIDER/);
});
