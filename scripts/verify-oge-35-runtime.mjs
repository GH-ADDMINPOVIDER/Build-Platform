import assert from "node:assert/strict";

const base = String(process.env.STAGING_URL || "https://wave.ogenicchocolate.com").replace(/\/$/, "");
const ownerKey = String(process.env.OGENIC_OPS_KEY || "").trim();
if (!ownerKey) throw new Error("CONFIGURATION_REQUIRED: OGENIC_OPS_KEY");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function json(response) {
  return response.json().catch(() => ({}));
}

async function waitForRoute() {
  for (let attempt = 1; attempt <= 60; attempt += 1) {
    const response = await fetch(`${base}/api/wave/command`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        intent: "read guarded command contract test",
        capability: "read_file",
        provider: "github",
        environment: "staging",
        input: { path: "tests/athena-guarded-command-handoff.test.mjs" },
      }),
    }).catch(() => null);
    if (response?.status === 401) {
      const body = await json(response);
      if (body?.code === "REAUTH_REQUIRED") return;
    }
    await sleep(5000);
  }
  throw new Error("OGE35_ROUTE_NOT_READY");
}

await waitForRoute();

const auth = await fetch(`${base}/api/session`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ owner_key: ownerKey }),
});
const authBody = await json(auth);
assert.equal(auth.status, 200, "owner authentication HTTP status");
assert.equal(authBody?.authenticated, true, "owner session authenticated");
assert.equal(authBody?.user?.role, "owner", "owner role");
const setCookie = auth.headers.get("set-cookie") || "";
const cookie = setCookie.split(";", 1)[0];
assert.ok(cookie.includes("="), "session cookie returned");

const readResponse = await fetch(`${base}/api/wave/command`, {
  method: "POST",
  headers: { "content-type": "application/json", cookie },
  body: JSON.stringify({
    intent: "read guarded command contract test",
    capability: "read_file",
    provider: "github",
    environment: "staging",
    input: { path: "tests/athena-guarded-command-handoff.test.mjs" },
  }),
});
const readBody = await json(readResponse);
assert.equal(readResponse.status, 200, `verified READ HTTP status: ${readBody?.code || "unknown"}`);
assert.equal(readBody?.ok, true);
assert.equal(readBody?.verification?.status, "verified");
assert.equal(readBody?.resolver?.descriptor?.permission_class, "READ");
assert.equal(readBody?.resolver?.descriptor?.provider_id, "github");
assert.equal(readBody?.resolver?.descriptor?.capability_id, "read_file");
assert.equal(readBody?.result?.path, "tests/athena-guarded-command-handoff.test.mjs");
assert.equal(readBody?.canonical?.conversation_id, "owner-main");
assert.equal(readBody?.canonical?.session_line, "1LSS_OWNER_MAIN");
assert.equal(typeof readBody?.canonical?.sequence, "number");
assert.equal(readBody?.command_handoff?.admission, "BLUE_DIAMOND_ATHENA");
assert.equal(readBody?.command_handoff?.actor_id, "athena-command");
assert.equal(readBody?.command_handoff?.execution_authority, "YELLOW_STONE_ONLY");
assert.equal(readBody?.command_handoff?.yellow_stone_route, "/api/capabilities/execute");
assert.equal(readBody?.command_handoff?.direct_execution_bypass, false);

const gatedResponse = await fetch(`${base}/api/wave/command`, {
  method: "POST",
  headers: { "content-type": "application/json", cookie },
  body: JSON.stringify({
    intent: "promote deployment",
    capability: "deploy_promote",
    provider: "cloudflare",
    environment: "staging",
  }),
});
const gatedBody = await json(gatedResponse);
assert.equal(gatedResponse.status, 409, `non-read approval gate HTTP status: ${gatedBody?.code || "unknown"}`);
assert.equal(gatedBody?.ok, false);
assert.equal(gatedBody?.code, "HUMAN_APPROVAL_REQUIRED");
assert.equal(gatedBody?.approval?.required, true);
assert.ok(["WRITE", "EXECUTE", "DANGEROUS"].includes(gatedBody?.approval?.permission_class));
assert.equal(gatedBody?.verification?.status, "blocked");
assert.equal(gatedBody?.verification?.reason, "NON_READ_CAPABILITY_REQUIRES_DETERMINISTIC_APPROVAL");
assert.equal(gatedBody?.command_handoff?.admission, "BLUE_DIAMOND_ATHENA");
assert.equal(gatedBody?.command_handoff?.execution_authority, "YELLOW_STONE_ONLY");
assert.equal(gatedBody?.command_handoff?.direct_execution_bypass, false);

const historyResponse = await fetch(`${base}/api/chat/history`, { headers: { cookie } });
const history = await json(historyResponse);
assert.equal(historyResponse.status, 200);
assert.equal(history?.conversation_id, "owner-main");
assert.equal(history?.session_line, "1LSS_OWNER_MAIN");
assert.ok(Array.isArray(history?.messages));
assert.ok(history.messages.some((message) =>
  message?.role === "system" &&
  String(message?.text || "").includes("YELLOW_STONE VERIFIED READ") &&
  String(message?.text || "").includes("tests/athena-guarded-command-handoff.test.mjs")
), "canonical 1LSS contains fresh guarded READ evidence");

console.log("OGE35_ATHENA_GUARDED_COMMAND_RUNTIME_PROOF_OK");
