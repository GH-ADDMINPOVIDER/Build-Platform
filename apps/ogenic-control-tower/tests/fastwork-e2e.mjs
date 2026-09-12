import assert from "node:assert/strict";
import { createServer } from "node:http";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createHttpServer, TEMPLATE_URI, VERSION } from "../server.js";
import mcpHandler from "../api/mcp.js";
import healthHandler from "../api/health.js";
import { runFastworkDryRun } from "./fastwork-dry-run.mjs";

const mode = process.argv[2] ?? "--local";
assert.ok(["--local", "--remote"].includes(mode), "Use --local or --remote");

function boundedFetch(input, init = {}) {
  const signals = [init.signal, AbortSignal.timeout(15000)].filter(Boolean);
  return fetch(input, { ...init, redirect: "error", signal: AbortSignal.any(signals) });
}

async function verify(base) {
  for (const path of ["/", "/healthz", "/api/health"]) {
    const response = await boundedFetch(`${base}${path}`);
    assert.equal(response.status, 200, `${path}: expected health HTTP 200`);
    const health = await response.json();
    assert.equal(health.name, "ogenic-god-toolkit");
    assert.equal(health.status, "ok");
    assert.equal(health.version, VERSION);
    assert.equal(health.mcp, "/mcp");
  }
  for (const path of ["/mcp", "/api/mcp"]) {
    const preflight = await boundedFetch(`${base}${path}`, { method: "OPTIONS" });
    assert.equal(preflight.status, 204, `${path}: expected OPTIONS HTTP 204`);
    const client = new Client({ name: "ogenic-fastwork-e2e", version: VERSION });
    try {
      await client.connect(new StreamableHTTPClientTransport(
        new URL(`${base}${path}`),
        { fetch: boundedFetch },
      ));
      const report = await runFastworkDryRun(client);
      const resource = await client.readResource({ uri: TEMPLATE_URI });
      assert.equal(resource.contents[0].uri, TEMPLATE_URI);
      assert.match(resource.contents[0].mimeType, /^text\/html;profile=mcp-app/);
      assert.ok(resource.contents[0].text.includes("ASK OGENIC"));
      const invalid = await client.callTool({ name: "route_request", arguments: { request: "" } });
      assert.equal(invalid.isError, true, "Empty requests must not produce a successful route");
      console.log(JSON.stringify({ endpoint: `${base}${path}`, result: "PASS", report }));
    } finally {
      await client.close();
    }
  }
}

function createVercelHarness() {
  return createServer(async (req, res) => {
    try {
      const path = new URL(req.url, "http://localhost").pathname;
      if (["/", "/healthz", "/api/health"].includes(path)) {
        return healthHandler(req, res);
      }
      if (["/mcp", "/api/mcp"].includes(path)) {
        if (req.method === "POST") {
          const chunks = [];
          for await (const chunk of req) chunks.push(chunk);
          req.body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        }
        return await mcpHandler(req, res);
      }
      res.writeHead(404).end("Not Found");
    } catch {
      if (!res.headersSent) res.writeHead(500);
      res.end("Vercel handler harness failed");
    }
  });
}

async function withLocal(server) {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  try {
    await verify(`http://127.0.0.1:${server.address().port}`);
  } finally {
    server.closeIdleConnections();
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

if (mode === "--remote") {
  let url;
  try {
    url = new URL(process.env.OGENIC_STAGING_ORIGIN);
  } catch {
    throw new Error("Set OGENIC_STAGING_ORIGIN to the authorized staging HTTPS origin");
  }
  assert.equal(url.protocol, "https:", "Remote verification requires HTTPS");
  assert.ok(!url.username && !url.password && !url.search && !url.hash, "Use an origin without credentials, query, or fragment");
  assert.equal(url.pathname, "/", "Use the staging origin, not an endpoint path");
  await verify(url.origin);
} else {
  await withLocal(createHttpServer());
  await withLocal(createVercelHarness());
}
console.log("Fastwork read-only MCP E2E PASS; approval decisions were simulated, not authenticated.");
