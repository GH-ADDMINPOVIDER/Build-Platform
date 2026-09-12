import assert from "node:assert/strict";

export const BRIEF = "Plan a website landing page for a fictional Fastwork client using only supplied copy.";
const CONSEQUENTIAL_REQUEST = "send email to the fictional Fastwork customer";

// Test-only decision simulation: never a human identity or authorization source.
// No executor, send adapter, deployment adapter, or credential access exists here.
export function simulateApproval(route, decision) {
  const result = { simulation: true, executionAuthorized: false, externalSideEffectsEnabled: false };
  if (route.approval !== "human_approval_required_before_consequential_action") {
    return { ...result, status: "not_required" };
  }
  if (!decision || decision.request !== route.request) {
    return { ...result, status: "pending_human_approval" };
  }
  if (decision.verdict === "deny") {
    return { ...result, status: "denied" };
  }
  if (decision.verdict === "approve") {
    return { ...result, status: "approved_dry_run_only" };
  }
  return { ...result, status: "pending_human_approval" };
}

async function call(client, name, args = {}) {
  const result = await client.callTool({ name, arguments: args });
  assert.notEqual(result.isError, true, `${name} returned a tool error`);
  assert.ok(result.structuredContent, `${name} must return structuredContent`);
  return result.structuredContent;
}

export async function runFastworkDryRun(client) {
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((tool) => tool.name).sort(),
    ["get_runtime_status", "list_capabilities", "render_control_tower", "route_request"]
  );
  for (const tool of tools) {
    assert.equal(tool.annotations?.readOnlyHint, true);
    assert.equal(tool.annotations?.destructiveHint, false);
  }
  const capabilities = await call(client, "list_capabilities");
  assert.equal(capabilities.capabilities.length, 11);
  const route = await call(client, "route_request", { request: BRIEF });
  assert.equal(route.primary, "04.web_app");
  assert.equal(route.approval, "auto");
  const review = await call(client, "route_request", { request: "patch code on a feature branch" });
  assert.equal(review.approval, "auto_with_review");
  const readonly = await call(client, "route_request", { request: "check production deploy status only" });
  assert.equal(readonly.approval, "auto");
  assert.equal(readonly.primary, "10.observability_control");
  const risky = await call(client, "route_request", { request: CONSEQUENTIAL_REQUEST });
  assert.equal(risky.approval, "human_approval_required_before_consequential_action");
  const rendered = await call(client, "render_control_tower", { route: risky });
  assert.deepEqual(rendered.route, risky);
  assert.equal(rendered.approvals.length, 1);
  assert.equal(rendered.approvals[0].status, "pending_human_approval");

  const cases = [
    ["missing", undefined, "pending_human_approval"],
    ["deny", { request: risky.request, verdict: "deny" }, "denied"],
    ["approve", { request: risky.request, verdict: "approve" }, "approved_dry_run_only"],
    ["wrong-action", { request: BRIEF, verdict: "approve" }, "pending_human_approval"],
    ["invalid", { request: risky.request, verdict: "yes" }, "pending_human_approval"],
  ];
  const approvals = cases.map(([name, decision, expected]) => {
    const gate = simulateApproval(risky, decision);
    assert.equal(gate.status, expected, name);
    assert.equal(gate.executionAuthorized, false, name);
    assert.equal(gate.externalSideEffectsEnabled, false, name);
    return { case: name, ...gate };
  });
  assert.equal(simulateApproval(route).status, "not_required");
  assert.equal(simulateApproval(review).status, "not_required");

  const runtime = await call(client, "get_runtime_status");
  assert.ok(runtime.verifiedReadyCount >= 0 && runtime.verifiedReadyCount <= 2);
  const github = runtime.surfaces.find((surface) => surface.name === "GitHub");
  const vercel = runtime.surfaces.find((surface) => surface.name === "Vercel");
  assert.ok(["ready", "needs_auth", "rate_limited", "offline", "error"].includes(github.status));
  assert.ok(["ready", "needs_auth", "rate_limited", "offline", "error"].includes(vercel.status));
  assert.ok(runtime.surfaces.filter((surface) => !["GitHub", "Vercel"].includes(surface.name)).every((surface) => surface.status === "unknown"));
  return {
    brief: BRIEF,
    mode: "fixture-only-dry-run",
    externalSideEffectsEnabled: false,
    executionAuthorized: false,
    route,
    draft: { source: "local fixture, not an executed deliverable", sections: ["Overview", "Services", "Contact placeholder"] },
    approvals,
    connectorState: { github: github.status, vercel: vercel.status },
  };
}
