import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const VERSION = "1.3.0";
const TEMPLATE_URI = "ui://ogenic/control-tower.html";
const controlTowerHtml = readFileSync("public/control-tower.html", "utf8");

const CAPABILITIES = [
  { id: "00", key: "core_router", name: "Core / Auto Router", children: ["intent", "decompose", "tool_discovery", "execution_selection", "approval", "verification", "audit"] },
  { id: "01", key: "code_build", name: "Code & Build", children: ["repo", "patch", "git", "test", "build", "pr", "codex"] },
  { id: "02", key: "system_runtime", name: "System & Runtime", children: ["filesystem", "process", "shell", "diagnostics", "health"] },
  { id: "03", key: "automation_delivery", name: "Automation & Delivery", children: ["n8n", "scheduler", "webhook", "ci_cd", "retry", "deploy", "rollback"] },
  { id: "04", key: "web_app", name: "Web / App / Cloudflare", children: ["frontend", "backend", "browser", "cloudflare", "d1", "vercel", "deploy_verify"] },
  { id: "05", key: "data_knowledge", name: "Data & Knowledge", children: ["drive", "notion", "files", "rag", "registry", "product_master", "provenance"] },
  { id: "06", key: "business_sales", name: "Business & Sales", children: ["buyer_intent", "retail_placement", "lead_score", "product_match", "commercial_calc", "sample_pipeline", "reorder"] },
  { id: "07", key: "communication", name: "Communication", children: ["gmail", "line_oa", "notification", "outreach", "followup"] },
  { id: "08", key: "security_credentials", name: "Security & Credentials", children: ["infisical", "auth", "scope", "approval_gate", "audit"] },
  { id: "09", key: "media_creative", name: "Media & Creative", children: ["image", "figma", "magnific", "poster", "brand", "ux_ui"] },
  { id: "10", key: "observability_control", name: "Observability & Control", children: ["runs", "agent_status", "connector_health", "quota_signal", "approvals", "failures"] },
];

const EXECUTION_SURFACES = [
  "OpenAI / ChatGPT",
  "Codex",
  "GitHub",
  "n8n",
  "Notion",
  "Google Drive",
  "Gmail / Calendar",
  "Linear",
  "Figma",
  "Magnific",
  "Shopify",
  "Vercel",
  "Cloudflare",
  "Infisical",
  "Web / Public Search",
  "Image Generation",
];

function includesAny(text, terms) {
  return terms.some((term) => text.includes(term));
}

function routeRequest(request) {
  const text = String(request || "").toLowerCase();
  let primary = "00.core_router";
  const support = [];
  let approval = "not_required_for_planning";

  if (includesAny(text, ["supplier", "ซัพพลายเออร์", "หาขนม", "lead", "ขายส่ง", "wholesale", "ลูกค้า", "ร้านกาแฟ", "คาเฟ่"])) {
    primary = "06.business_sales";
    support.push("05.data_knowledge");
  } else if (includesAny(text, ["figma", "poster", "โปสเตอร์", "image", "รูป", "ux", "ui", "design"])) {
    primary = "09.media_creative";
    support.push("05.data_knowledge");
  } else if (includesAny(text, ["cloudflare", "website", "เว็บ", "frontend", "backend", "vercel", "d1"])) {
    primary = "04.web_app";
    support.push("01.code_build");
  } else if (includesAny(text, ["n8n", "workflow", "schedule", "automation", "webhook", "deploy", "ci/cd", "ci "])) {
    primary = "03.automation_delivery";
    support.push("01.code_build");
  } else if (includesAny(text, ["github", "repo", "code", "bug", "test", "build", "codex", "pr "])) {
    primary = "01.code_build";
  } else if (includesAny(text, ["drive", "notion", "rag", "ไฟล์", "product master", "registry"])) {
    primary = "05.data_knowledge";
  } else if (includesAny(text, ["gmail", "email", "line", "ข้อความ", "ทัก", "ส่งเมล", "outreach"])) {
    primary = "07.communication";
  } else if (includesAny(text, ["secret", "infisical", "auth", "permission", "credential", "token", "api key"])) {
    primary = "08.security_credentials";
  } else if (includesAny(text, ["status", "health", "quota", "limit", "log", "error", "failure"])) {
    primary = "10.observability_control";
  }

  if (includesAny(text, ["delete", "ลบ", "production", "prod", "ส่งเลย", "ทักไป", "send now", "permission", "secret", "credential"])) {
    approval = "human_approval_required_before_consequential_action";
  }

  return {
    request,
    primary,
    support: [...new Set(support)],
    approval,
    executionPolicy: [
      "direct connected tool first",
      "authorized hosted agent/runtime for implementation-heavy work",
      "orchestrator for repeatable multi-service flow",
      "never claim an unavailable execution surface ran",
    ],
    verify: true,
  };
}

function runtimeStatus() {
  return EXECUTION_SURFACES.map((name) => ({
    name,
    status: "unknown",
    note: "Resolve from the connected runtime at execution time; do not infer readiness from this scaffold.",
  }));
}

function createOgenicServer() {
  const server = new McpServer(
    { name: "ogenic-god-toolkit", version: VERSION },
    {
      instructions:
        "Use the OGENIC capability index to route outcomes automatically. Read before write, apply approval gates, verify writes/sends/deploys, preserve provenance, never expose secrets, and never simulate successful execution.",
    },
  );

  registerAppResource(
    server,
    "ogenic-control-tower",
    TEMPLATE_URI,
    {},
    async () => ({
      contents: [
        {
          uri: TEMPLATE_URI,
          mimeType: RESOURCE_MIME_TYPE,
          text: controlTowerHtml,
          _meta: { ui: { prefersBorder: false } },
        },
      ],
    }),
  );

  registerAppTool(
    server,
    "list_capabilities",
    {
      title: "List OGENIC capabilities",
      description: "Use this when the user wants to inspect the OGENIC capability index or available capability categories.",
      inputSchema: {},
      outputSchema: {
        capabilities: z.array(z.object({ id: z.string(), key: z.string(), name: z.string(), children: z.array(z.string()) })),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async () => ({
      structuredContent: { capabilities: CAPABILITIES },
      content: [{ type: "text", text: `OGENIC GOD TOOLKIT v${VERSION} exposes ${CAPABILITIES.length} capability groups.` }],
    }),
  );

  registerAppTool(
    server,
    "route_request",
    {
      title: "Route an OGENIC request",
      description: "Use this when the user wants OGENIC to classify a requested outcome into the minimum capability chain before execution.",
      inputSchema: { request: z.string().min(1) },
      outputSchema: {
        request: z.string(),
        primary: z.string(),
        support: z.array(z.string()),
        approval: z.string(),
        executionPolicy: z.array(z.string()),
        verify: z.boolean(),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async ({ request }) => {
      const route = routeRequest(request);
      return {
        structuredContent: route,
        content: [{ type: "text", text: `Primary route: ${route.primary}. Approval: ${route.approval}.` }],
      };
    },
  );

  registerAppTool(
    server,
    "get_runtime_status",
    {
      title: "Get OGENIC runtime status",
      description: "Use this when the user wants the Control Tower to show execution surfaces. This scaffold returns unknown until live connector health adapters are wired.",
      inputSchema: {},
      outputSchema: { surfaces: z.array(z.object({ name: z.string(), status: z.string(), note: z.string() })) },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async () => ({
      structuredContent: { surfaces: runtimeStatus() },
      content: [{ type: "text", text: "Runtime adapters are not wired in this scaffold; statuses are intentionally unknown rather than guessed." }],
    }),
  );

  registerAppTool(
    server,
    "render_control_tower",
    {
      title: "Render OGENIC Control Tower",
      description: "Use this when the user wants the mobile-first OGENIC Control Tower UI. Optionally route a request first and render the route with capability and runtime status.",
      inputSchema: { request: z.string().optional() },
      outputSchema: {
        version: z.string(),
        route: z.any().nullable(),
        capabilities: z.array(z.any()),
        surfaces: z.array(z.any()),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
      _meta: {
        ui: { resourceUri: TEMPLATE_URI },
        "openai/toolInvocation/invoking": "Opening OGENIC Control Tower…",
        "openai/toolInvocation/invoked": "OGENIC Control Tower ready.",
      },
    },
    async ({ request }) => ({
      structuredContent: {
        version: VERSION,
        route: request ? routeRequest(request) : null,
        capabilities: CAPABILITIES,
        surfaces: runtimeStatus(),
      },
      content: [{ type: "text", text: "Rendered OGENIC Control Tower. Runtime readiness is resolved only from live connected adapters." }],
    }),
  );

  return server;
}

const port = Number(process.env.PORT ?? 8787);
const MCP_PATH = "/mcp";

const httpServer = createServer(async (req, res) => {
  if (!req.url) {
    res.writeHead(400).end("Missing URL");
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host ?? "localhost"}`);

  if (req.method === "OPTIONS" && url.pathname === MCP_PATH) {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, GET, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "content-type, mcp-session-id",
      "Access-Control-Expose-Headers": "Mcp-Session-Id",
    });
    res.end();
    return;
  }

  if (req.method === "GET" && url.pathname === "/") {
    res.writeHead(200, { "content-type": "application/json" }).end(
      JSON.stringify({ name: "ogenic-god-toolkit", version: VERSION, mcp: MCP_PATH, status: "ok" }),
    );
    return;
  }

  const MCP_METHODS = new Set(["POST", "GET", "DELETE"]);
  if (url.pathname === MCP_PATH && req.method && MCP_METHODS.has(req.method)) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");

    const server = createOgenicServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    res.on("close", () => {
      transport.close();
      server.close();
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res);
    } catch (error) {
      console.error("Error handling MCP request:", error);
      if (!res.headersSent) res.writeHead(500).end("Internal server error");
    }
    return;
  }

  res.writeHead(404).end("Not Found");
});

httpServer.listen(port, () => {
  console.log(`OGENIC GOD TOOLKIT listening on http://localhost:${port}${MCP_PATH}`);
});
