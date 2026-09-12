import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import defaultHttpServer, { createHttpServer, TEMPLATE_URI } from "../server.js";

assert.equal(typeof defaultHttpServer.listen, "function", "Vercel root entrypoint must export an HTTP server");

const httpServer = createHttpServer();
await new Promise((resolve, reject) => {
  httpServer.once("error", reject);
  httpServer.listen(0, "127.0.0.1", resolve);
});
const { port } = httpServer.address();
const base = `http://127.0.0.1:${port}`;
const client = new Client({ name: "ogenic-ci-smoke", version: "1.0.0" });
try {
  const health = await fetch(`${base}/healthz`).then((r) => r.json());
  assert.equal(health.name, "ogenic-god-toolkit");
  assert.equal(health.status, "ok");
  const apiHealth = await fetch(`${base}/api/health`).then((r) => r.json());
  assert.equal(apiHealth.status, "ok");

  const aliasClient = new Client({ name: "ogenic-ci-vercel-alias", version: "1.0.0" });
  try {
    const aliasTransport = new StreamableHTTPClientTransport(new URL(`${base}/api/mcp`));
    await aliasClient.connect(aliasTransport);
    const aliasTools = await aliasClient.listTools();
    assert.equal(aliasTools.tools.length, 4);
  } finally {
    await aliasClient.close().catch(() => {});
  }

  const transport = new StreamableHTTPClientTransport(new URL(`${base}/mcp`));
  await client.connect(transport);

  const listed = await client.listTools();
  const names = listed.tools.map((t) => t.name).sort();
  assert.deepEqual(names, ["get_runtime_status", "list_capabilities", "render_control_tower", "route_request"]);
  for (const tool of listed.tools) {
    assert.equal(tool.annotations?.readOnlyHint, true, `${tool.name} must be read-only`);
    assert.equal(tool.annotations?.destructiveHint, false, `${tool.name} must not be destructive`);
  }

  const caps = await client.callTool({ name: "list_capabilities", arguments: {} });
  assert.equal(caps.structuredContent.capabilities.length, 11);
  const codeBuild = caps.structuredContent.capabilities.find((c) => c.key === "code_build");
  assert.ok(codeBuild.children.includes("claude_review"));
  assert.ok(codeBuild.children.includes("agent_handoff"));

  const route = await client.callTool({ name: "route_request", arguments: { request: "หาร้านที่กำลังหาซัพพลายเออร์เบเกอรี่" } });
  assert.equal(route.structuredContent.primary, "06.business_sales");
  assert.equal(route.structuredContent.verify, true);
  assert.equal(route.structuredContent.approval, "auto");

  const risky = await client.callTool({ name: "route_request", arguments: { request: "deploy production now" } });
  assert.equal(risky.structuredContent.approval, "human_approval_required_before_consequential_action");

  const productionStatus = await client.callTool({ name: "route_request", arguments: { request: "check production deploy status only" } });
  assert.equal(productionStatus.structuredContent.approval, "auto");

  const rotateKey = await client.callTool({ name: "route_request", arguments: { request: "rotate API key" } });
  assert.equal(rotateKey.structuredContent.approval, "human_approval_required_before_consequential_action");

  const secretMetadata = await client.callTool({ name: "route_request", arguments: { request: "check Infisical secret metadata and permission status only" } });
  assert.equal(secretMetadata.structuredContent.primary, "08.security_credentials");
  assert.equal(secretMetadata.structuredContent.approval, "auto");

  const chargeStatus = await client.callTool({ name: "route_request", arguments: { request: "check the 46 USD charge status only" } });
  assert.equal(chargeStatus.structuredContent.approval, "auto");

  const thaiChargeStatus = await client.callTool({ name: "route_request", arguments: { request: "ตรวจสอบรายการเรียกเก็บเงิน 46 USD เท่านั้น" } });
  assert.equal(thaiChargeStatus.structuredContent.approval, "auto");

  const payment = await client.callTool({ name: "route_request", arguments: { request: "make a payment now" } });
  assert.equal(payment.structuredContent.approval, "human_approval_required_before_consequential_action");

  const contactLead = await client.callTool({ name: "route_request", arguments: { request: "contact the lead" } });
  assert.equal(contactLead.structuredContent.approval, "human_approval_required_before_consequential_action");

  const draftLeadEmail = await client.callTool({ name: "route_request", arguments: { request: "draft an email to the lead" } });
  assert.equal(draftLeadEmail.structuredContent.approval, "auto");

  const internalReview = await client.callTool({ name: "route_request", arguments: { request: "Codex fix CI then Claude review the patch" } });
  assert.equal(internalReview.structuredContent.primary, "03.automation_delivery");
  assert.ok(internalReview.structuredContent.support.includes("01.code_build"));
  assert.equal(internalReview.structuredContent.approval, "auto_with_review");

  const stagingDeploy = await client.callTool({ name: "route_request", arguments: { request: "deploy staging preview" } });
  assert.equal(stagingDeploy.structuredContent.primary, "03.automation_delivery");
  assert.equal(stagingDeploy.structuredContent.approval, "auto_with_review");

  const productMaster = await client.callTool({ name: "route_request", arguments: { request: "check product master status" } });
  assert.equal(productMaster.structuredContent.primary, "05.data_knowledge");
  assert.equal(productMaster.structuredContent.approval, "auto");

  const status = await client.callTool({ name: "get_runtime_status", arguments: {} });
  assert.equal(status.structuredContent.verifiedReadyCount, 0);
  assert.ok(status.structuredContent.surfaces.every((s) => s.status === "unknown"));
  assert.ok(status.structuredContent.surfaces.some((s) => s.name === "Claude / Anthropic"));

  const rendered = await client.callTool({ name: "render_control_tower", arguments: { route: risky.structuredContent } });
  assert.equal(rendered.structuredContent.router.status, "verified");
  assert.equal(rendered.structuredContent.route.request, "deploy production now");
  assert.equal(rendered.structuredContent.approvals.length, 1);
  assert.equal(rendered.structuredContent.approvals[0].status, "pending_human_approval");
  assert.equal(rendered.structuredContent.buyerIntentRadar.status, "unknown");
  assert.equal(rendered.structuredContent.buyerIntentRadar.leads.length, 0);

  const resource = await client.readResource({ uri: TEMPLATE_URI });
  assert.equal(resource.contents[0].uri, TEMPLATE_URI);
  assert.match(resource.contents[0].mimeType, /^text\/html;profile=mcp-app/);
  assert.ok(resource.contents[0].text.includes("ASK OGENIC"));
  assert.deepEqual(resource.contents[0]._meta?.ui?.csp?.connectDomains, []);
  assert.deepEqual(resource.contents[0]._meta?.ui?.csp?.resourceDomains, []);

  const rootHealth = await fetch(`${base}/`).then((r) => r.json());
  assert.equal(rootHealth.status, "ok");

  console.log("MCP smoke PASS");
} finally {
  await client.close().catch(() => {});
  await new Promise((resolve) => httpServer.close(resolve));
}
