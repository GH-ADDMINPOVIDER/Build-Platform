import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL("../" + path, import.meta.url), "utf8");

const main = read("src/main.tsx");
const lab = read("src/MaopLab.tsx");
const api = read("worker/maop-lab-api.ts");
const entry = read("worker/entry-yellow-stone.ts");

test("MA-OP Web Lab is a real canonical web route", () => {
  assert.match(main, /pathname === "\/maop"/);
  assert.match(main, /<MaopLab \/>/);
  assert.match(lab, /\/api\/maop\/lab\/core/);
  assert.match(lab, /\/api\/maop\/lab\/github/);
  assert.match(lab, /\/api\/ruby\/scorecard/);
});

test("MA-OP lab APIs require owner or ops auth", () => {
  assert.match(api, /hasOwnerOrOpsAccess/);
  assert.match(api, /REAUTH_REQUIRED/);
  assert.match(api, /owner_or_ops_auth_required: true/);
});

test("live GitHub bridge stays READ-only and Yellow-routed", () => {
  assert.match(api, /MaopGithubBridge/);
  assert.match(api, /github\.file\.read/);
  assert.match(api, /capability: "read_file"/);
  assert.match(api, /createCapabilityExecutionApi/);
  assert.doesNotMatch(api, /write_file|git_commit|deploy_promote|merge|delete/);
});

test("worker entry routes MA-OP lab without bypassing Yellow", () => {
  assert.match(entry, /createMaopLabApi/);
  assert.match(entry, /pathname\.startsWith\("\/api\/maop\/lab"/);
  assert.match(api, /direct_provider_bypass: false/);
});
