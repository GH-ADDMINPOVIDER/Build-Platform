import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createOgenicServer } from "../server.js";

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, GET, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "content-type, accept, mcp-session-id, mcp-protocol-version, authorization");
    res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id, MCP-Protocol-Version");
    res.statusCode = 204;
    res.end();
    return;
  }

  if (!["POST", "GET", "DELETE"].includes(req.method || "")) {
    res.statusCode = 405;
    res.setHeader("Allow", "POST, GET, DELETE, OPTIONS");
    res.end("Method Not Allowed");
    return;
  }

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id, MCP-Protocol-Version");
  const server = createOgenicServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  res.on("close", () => {
    transport.close().catch?.(() => {});
    server.close().catch?.(() => {});
  });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res);
  } catch (error) {
    console.error("Vercel MCP request failed:", error);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.end("Internal server error");
    }
  }
}
