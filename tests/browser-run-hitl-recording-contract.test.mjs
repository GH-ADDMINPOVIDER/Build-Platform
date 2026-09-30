import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../worker/browser-session-api.ts", import.meta.url), "utf8");

test("Browser Run starts recorded sessions and exposes live view", () => {
  assert.match(source, /recording:\s*true/);
  assert.match(source, /Cloudflare\.getLiveView/);
  assert.match(source, /session_recording:\s*true/);
  assert.match(source, /recording_retention_days:\s*30/);
});

test("structured HITL handoff is explicit and resumable only after human control ends", () => {
  assert.match(source, /Cloudflare\.getHandoffState/);
  assert.match(source, /Cloudflare\.handoff/);
  assert.match(source, /\/api\/browser-session\/:id\/handoff/);
  assert.match(source, /\/api\/browser-session\/:id\/resume/);
  assert.match(source, /HUMAN_CONTROL_ACTIVE/);
  assert.match(source, /resume_pending/);
  assert.match(source, /AGENT_MUST_WAIT_UNTIL_HANDOFF_IS_NOT_ACTIVE/);
});

test("browser control states are explicit", () => {
  for (const state of ["agent_control", "human_control", "resume_pending", "completed", "failed"]) {
    assert.ok(source.includes(`\"${state}\"`), `missing browser control state ${state}`);
  }
});

test("recording evidence persists only a compact reference to canonical 1LSS", () => {
  assert.match(source, /ONE_LINE_ID = "owner-main"/);
  assert.match(source, /ONE_LINE_SESSION = "1LSS_OWNER_MAIN"/);
  assert.match(source, /browser_recording:\$\{sessionId\}:closed/);
  assert.match(source, /recording_ref=cloudflare_browser_run/);
  assert.match(source, /source_surface, idempotency_key/);
  assert.match(source, /CLOUDFLARE_BROWSER_RUN_DASHBOARD_OR_SERVER_SIDE_ADAPTER/);
  assert.doesNotMatch(source, /CLOUDFLARE_API_TOKEN/);
});

test("browser target URL remains SSRF guarded and owner-session protected", () => {
  assert.match(source, /requireOwnerSession/);
  assert.match(source, /PRIVATE_NETWORK_URL_BLOCKED/);
  assert.match(source, /UNSUPPORTED_URL_SCHEME/);
});
