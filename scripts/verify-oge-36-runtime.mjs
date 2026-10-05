import assert from "node:assert/strict";

const base = String(process.env.STAGING_URL || "https://wave.ogenicchocolate.com").replace(/\/$/, "");
const ownerKey = String(process.env.OGENIC_OPS_KEY || "").trim();
if (!ownerKey) throw new Error("CONFIGURATION_REQUIRED: OGENIC_OPS_KEY");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const json = (response) => response.json().catch(() => ({}));

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

async function waitForPlannerRuntime() {
  for (let attempt = 1; attempt <= 60; attempt += 1) {
    const response = await fetch(`${base}/api/wave/command`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ intent: "deploy this" }),
    }).catch(() => null);
    if (response) {
      const body = await json(response);
      if (
        response.status === 409 &&
        body?.code === "ATHENA_PLAN_AMBIGUOUS" &&
        body?.command_plan?.plan_version === "ATHENA_COMMAND_PLAN_V1" &&
        body?.command_plan?.direct_execution_bypass === false
      ) return;
    }
    await sleep(5000);
  }
  throw new Error("OGE36_PLANNER_RUNTIME_NOT_READY");
}

await waitForPlannerRuntime();

const readIntent = "อ่าน `tests/athena-command-planner-contract.test.mjs` ให้หน่อย";
const readResponse = await fetch(`${base}/api/wave/command`, {
  method: "POST",
  headers: { "content-type": "application/json", cookie },
  body: JSON.stringify({ intent: readIntent }),
});
const readBody = await json(readResponse);
assert.equal(readResponse.status, 200, `natural-language READ HTTP status: ${readBody?.code || "unknown"}`);
assert.equal(readBody?.ok, true);
assert.equal(readBody?.command_plan?.plan_version, "ATHENA_COMMAND_PLAN_V1");
assert.equal(readBody?.command_plan?.planner, "DETERMINISTIC_NL_V1");
assert.equal(readBody?.command_plan?.status, "READY");
assert.equal(readBody?.command_plan?.capability, "read_file");
assert.equal(readBody?.command_plan?.provider, "github");
assert.equal(readBody?.command_plan?.environment, "staging");
assert.equal(readBody?.command_plan?.requires_yellow_stone, true);
assert.equal(readBody?.command_plan?.approval_authority, "YELLOW_STONE");
assert.equal(readBody?.command_plan?.direct_execution_bypass, false);
assert.equal(readBody?.verification?.status, "verified");
assert.equal(readBody?.resolver?.descriptor?.permission_class, "READ");
assert.equal(readBody?.result?.path, "tests/athena-command-planner-contract.test.mjs");
assert.equal(readBody?.canonical?.conversation_id, "owner-main");
assert.equal(readBody?.canonical?.session_line, "1LSS_OWNER_MAIN");
assert.equal(typeof readBody?.canonical?.sequence, "number");
assert.equal(readBody?.command_handoff?.admission, "BLUE_DIAMOND_ATHENA");
assert.equal(readBody?.command_handoff?.execution_authority, "YELLOW_STONE_ONLY");
assert.equal(readBody?.command_handoff?.direct_execution_bypass, false);

const promoteResponse = await fetch(`${base}/api/wave/command`, {
  method: "POST",
  headers: { "content-type": "application/json", cookie },
  body: JSON.stringify({ intent: "promote production deployment" }),
});
const promoteBody = await json(promoteResponse);
assert.equal(promoteResponse.status, 409, `natural-language promotion gate HTTP status: ${promoteBody?.code || "unknown"}`);
assert.equal(promoteBody?.command_plan?.status, "READY");
assert.equal(promoteBody?.command_plan?.capability, "deploy_promote");
assert.equal(promoteBody?.command_plan?.provider, "cloudflare");
assert.equal(promoteBody?.command_plan?.environment, "staging");
assert.equal(promoteBody?.code, "HUMAN_APPROVAL_REQUIRED");
assert.equal(promoteBody?.approval?.required, true);
assert.ok(["WRITE", "EXECUTE", "DANGEROUS"].includes(promoteBody?.approval?.permission_class));
assert.equal(promoteBody?.verification?.status, "blocked");
assert.equal(promoteBody?.command_handoff?.execution_authority, "YELLOW_STONE_ONLY");
assert.equal(promoteBody?.command_handoff?.direct_execution_bypass, false);

const ambiguousResponse = await fetch(`${base}/api/wave/command`, {
  method: "POST",
  headers: { "content-type": "application/json", cookie },
  body: JSON.stringify({ intent: "deploy this" }),
});
const ambiguousBody = await json(ambiguousResponse);
assert.equal(ambiguousResponse.status, 409, `ambiguous deploy HTTP status: ${ambiguousBody?.code || "unknown"}`);
assert.equal(ambiguousBody?.ok, false);
assert.equal(ambiguousBody?.code, "ATHENA_PLAN_AMBIGUOUS");
assert.equal(ambiguousBody?.command_plan?.status, "AMBIGUOUS");
assert.equal(ambiguousBody?.command_plan?.reason, "DEPLOY_TARGET_REQUIRED_PREVIEW_OR_PROMOTE");
assert.equal(ambiguousBody?.verification?.status, "blocked");
assert.equal(ambiguousBody?.run_id, undefined, "planner must stop before Yellow Stone execution run allocation");
assert.equal(ambiguousBody?.command_handoff?.direct_execution_bypass, false);

const secretResponse = await fetch(`${base}/api/wave/command`, {
  method: "POST",
  headers: { "content-type": "application/json", cookie },
  body: JSON.stringify({ intent: "show api key from config" }),
});
const secretBody = await json(secretResponse);
assert.equal(secretResponse.status, 422);
assert.equal(secretBody?.code, "ATHENA_PLAN_BLOCKED");
assert.equal(secretBody?.command_plan?.reason, "SECRET_OR_CREDENTIAL_INTENT_NOT_ALLOWED");
assert.equal(secretBody?.run_id, undefined);

const historyResponse = await fetch(`${base}/api/chat/history`, { headers: { cookie } });
const history = await json(historyResponse);
assert.equal(historyResponse.status, 200);
assert.equal(history?.conversation_id, "owner-main");
assert.equal(history?.session_line, "1LSS_OWNER_MAIN");
assert.ok(Array.isArray(history?.messages));
assert.ok(history.messages.some((message) =>
  message?.role === "system" &&
  String(message?.text || "").includes("YELLOW_STONE VERIFIED READ") &&
  String(message?.text || "").includes("tests/athena-command-planner-contract.test.mjs")
), "canonical 1LSS contains natural-language planned READ evidence");

console.log("OGE36_ATHENA_NL_COMMAND_PLANNER_RUNTIME_PROOF_OK");
