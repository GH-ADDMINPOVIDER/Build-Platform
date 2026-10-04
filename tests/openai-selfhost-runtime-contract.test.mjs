import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("OGE-28 self-host route is owner/ops gated, staging-only and approval-gated", () => {
  const source = read("worker/openai-selfhost-api.ts");
  assert.match(source, /hasOwnerOrOpsAccess/);
  assert.match(source, /\/api\/openai\/selfhost\/proof/);
  assert.match(source, /HUMAN_APPROVAL_REQUIRED/);
  assert.match(source, /CANONICAL_STAGING_BRANCH = "phase-vi-provider-incentive-metering"/);
  assert.match(source, /ENVIRONMENT_SCOPE_MISMATCH/);
});

test("OGE-28 creates a real self-hosted Agent environment and preserves the legacy full dispatch path", () => {
  const source = read("worker/openai-selfhost-api.ts");
  assert.match(source, /type: "self_hosted"/);
  assert.match(source, /workspace_directory: workspace/);
  assert.match(source, /wave-openai-selfhost-executor\.yml/);
  assert.match(source, /actions\/workflows\/\$\{EXECUTOR_WORKFLOW\}\/dispatches/);
  assert.match(source, /environment_id: input\.environmentId/);
  assert.match(source, /remote_url: input\.remoteUrl/);
  assert.match(source, /session_id: input\.sessionId/);
});

test("OGE-28 supports external GitHub Actions dispatch without depending on the stale Worker GitHub credential", () => {
  const source = read("worker/openai-selfhost-api.ts");
  assert.match(source, /type ProofPhase = "full" \| "prepare" \| "verify"/);
  assert.match(source, /phase === "prepare"/);
  assert.match(source, /phase === "verify"/);
  assert.match(source, /PREPARED_EXTERNAL_DISPATCH/);
  assert.match(source, /external_dispatch_supported: true/);
  assert.match(source, /remote_url: prepared\.remoteUrl/);
  assert.match(source, /INVALID_PREPARED_SESSION_METADATA/);
});

test("OGE-28 sends input through Agent session events and waits for root terminal evidence", () => {
  const source = read("worker/openai-selfhost-api.ts");
  assert.match(source, /agent\.session\.input\.message/);
  assert.match(source, /agent\.session\.turn\.completed/);
  assert.match(source, /agent\.session\.turn\.failed/);
  assert.match(source, /agent\.session\.environment\.failed/);
  assert.match(source, /SELFHOST_PROOF_OUTPUT_UNVERIFIED/);
  assert.match(source, /WAVE_SELFHOST_PROOF_OK/);
});

test("OGE-28 writes compact verified evidence to canonical 1LSS without executor secret material", () => {
  const source = read("worker/openai-selfhost-api.ts");
  assert.match(source, /CANONICAL_CONVERSATION = "owner-main"/);
  assert.match(source, /CANONICAL_SESSION_LINE = "1LSS_OWNER_MAIN"/);
  assert.match(source, /OGE-28 VERIFIED SELF-HOST EXECUTION/);
  assert.match(source, /result_sha256/);
  assert.match(source, /SECRET_LIKE_EVIDENCE_REJECTED/);
  assert.doesNotMatch(source, /OPENAI_EXECUTOR_API_KEY/);
  assert.doesNotMatch(source, /CODEX_API_KEY/);
});

test("Yellow Stone mounts the self-host runtime without replacing the base Worker", () => {
  const source = read("worker/entry-yellow-stone.ts");
  assert.match(source, /createOpenAISelfHostApi/);
  assert.match(source, /pathname\.startsWith\("\/api\/openai\/selfhost\/"\)/);
  assert.match(source, /selfHostApi\.fetch/);
  assert.match(source, /base\.fetch/);
  assert.match(source, /base\.scheduled/);
});
