import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const planner = fs.readFileSync("worker/athena-command-planner.ts", "utf8");
const entry = fs.readFileSync("worker/entry-yellow-stone.ts", "utf8");
const unifiend = fs.readFileSync("src/UnifiendNext.tsx", "utf8");
const athenaChat = fs.readFileSync("worker/athena-chat-api.ts", "utf8");

test("ATHENA planner is bounded to staging and Yellow Stone authority", () => {
  assert.match(planner, /plan_version:\s*"ATHENA_COMMAND_PLAN_V1"/);
  assert.match(planner, /environment:\s*"staging"/);
  assert.match(planner, /requires_yellow_stone:\s*true/);
  assert.match(planner, /approval_authority:\s*"SIGNED_OWNER_SESSION"/);
  assert.match(planner, /direct_execution_bypass:\s*false/);
});

test("natural-language read maps only to GitHub read_file with a concrete path", () => {
  assert.match(planner, /capability:\s*"read_file"/);
  assert.match(planner, /provider:\s*"github"/);
  assert.match(planner, /RESOURCE_PATH_REQUIRED_FOR_VERIFIED_READ/);
  assert.match(planner, /MULTIPLE_RESOURCE_PATHS/);
});

test("deployment language distinguishes preview from promotion and fails ambiguous deploy closed", () => {
  assert.match(planner, /capability:\s*"deploy_promote"/);
  assert.match(planner, /capability:\s*"deploy_preview"/);
  assert.match(planner, /DEPLOY_TARGET_REQUIRED_PREVIEW_OR_PROMOTE/);
});

test("planner rejects arbitrary URLs and credential-oriented intents", () => {
  assert.match(planner, /ARBITRARY_URL_NOT_ALLOWED/);
  assert.match(planner, /SECRET_OR_CREDENTIAL_INTENT_NOT_ALLOWED/);
  assert.match(planner, /SENSITIVE_PATH/);
});

test("Unifiend command gateway never executes a provider directly", () => {
  assert.match(entry, /planAthenaCommand\(intent\)/);
  assert.match(entry, /url\.pathname = "\/api\/capabilities\/execute"/);
  assert.match(entry, /executionApi\.fetch\(delegated/);
  assert.match(entry, /execution_authority:\s*EXECUTION_AUTHORITY/);
  assert.match(entry, /direct_execution_bypass:\s*false/);
  assert.doesNotMatch(entry, /api\.github\.com/);
  assert.doesNotMatch(entry, /api\.cloudflare\.com/);
});

test("gateway strips planner authority fields and clamps execution environment", () => {
  assert.match(entry, /environment:\s*"staging"/);
  assert.match(entry, /allowMigration:\s*false/);
  assert.match(entry, /allowOptional:\s*false/);
  assert.match(entry, /command_plan:/);
  assert.match(entry, /ATHENA_PLAN_/);
});

test("Unifiend Run already submits plain-language intent to the guarded command route", () => {
  assert.match(unifiend, /intent:\s*intent/);
  assert.match(unifiend, /fetch\("\/api\/unifiend\/command"/);
  assert.match(unifiend, /Run guarded command/);
  assert.match(unifiend, /commandResult\.resolver\?\.descriptor\?\.capability_id/);
  assert.match(unifiend, /commandResult\.resolver\?\.descriptor\?\.provider_id/);
});

test("OGE-34 ATHENA chat lane remains separate from command planning", () => {
  assert.doesNotMatch(athenaChat, /athena-command-planner/);
  assert.doesNotMatch(athenaChat, /\/api\/capabilities\/execute/);
});
