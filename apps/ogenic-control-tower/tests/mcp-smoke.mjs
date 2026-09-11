import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createHttpServer, TEMPLATE_URI } from "../server.js";

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

  const route = await client.callTool({ name: "route_request", arguments: { request: "หาร้านที่กำลังหาซัพพลายเออร์เบเกอรี่" } });
  assert.equal(route.structuredContent.primary, "06.business_sales");
  assert.equal(route.structuredContent.verify, true);

  const risky = await client.callTool({ name: "route_request", arguments: { request: "deploy production now" } });
  assert.equal(risky.structuredContent.approval, "human_approval_required_before_consequential_action");

  const status = await client.callTool({ name: "get_runtime_status", arguments: {} });
  assert.equal(status.structuredContent.verifiedReadyCount, 0);
  assert.ok(status.structuredContent.surfaces.every((s) => s.status === "unknown"));

  const rendered = await client.callTool({ name: "render_control_tower", arguments: { request: "check status" } });
  assert.equal(rendered.structuredContent.router.status, "verified");
  assert.equal(rendered.structuredContent.buyerIntentRadar.status, "unknown");
  assert.equal(rendered.structuredContent.buyerIntentRadar.leads.length, 0);

  const resource = await client.readResource({ uri: TEMPLATE_URI });
  assert.equal(resource.contents[0].uri, TEMPLATE_URI);
  assert.match(resource.contents[0].mimeType, /^text\/html;profile=mcp-app/);
  assert.ok(resource.contents[0].text.includes("ASK OGENIC"));
  assert.deepEqual(resource.contents[0]._meta?.ui?.csp?.connectDomains, []);
  assert.deepEqual(resource.contents[0]._meta?.ui?.csp?.resourceDomains, []);

  console.log("MCP smoke PASS");
} finally {
  await client.close().catch(() => {});
  await new Promise((resolve) => httpServer.close(resolve));
}
