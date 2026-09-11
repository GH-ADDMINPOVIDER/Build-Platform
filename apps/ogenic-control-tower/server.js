import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

export const VERSION = "1.3.0";
export const TEMPLATE_URI = "ui://ogenic/control-tower-v1.3.0.html";
const __dirname = dirname(fileURLToPath(import.meta.url));
const controlTowerHtml = readFileSync(join(__dirname, "public", "control-tower.html"), "utf8");

export const CAPABILITIES = [
  { id: "00", key: "core_router", name: "Core / Auto Router", children: ["intent", "decompose", "tool_discovery", "execution_selection", "approval_classification", "verification", "audit"] },
  { id: "01", key: "code_build", name: "Code & Build", children: ["repo_inspect", "patch", "git", "branch", "test", "lint", "typecheck", "build", "pr", "codex_delegate"] },
  { id: "02", key: "system_runtime", name: "System & Runtime", children: ["filesystem", "process", "shell", "diagnostics", "dependencies", "health"] },
  { id: "03", key: "automation_delivery", name: "Automation & Delivery", children: ["n8n", "scheduler", "webhook", "ci_cd", "retries", "dead_letter", "deploy", "rollback"] },
  { id: "04", key: "web_app", name: "Web / App / Cloudflare", children: ["frontend", "backend", "browser", "dom", "cloudflare_workers", "cloudflare_pages", "d1", "vercel", "deploy_verify"] },
  { id: "05", key: "data_knowledge", name: "Data & Knowledge", children: ["google_drive", "notion", "files", "rag", "registry", "product_master", "documents", "provenance"] },
  { id: "06", key: "business_sales", name: "Business & Sales", children: ["buyer_intent", "retail_placement", "lead_discovery", "lead_enrichment", "fit_score", "product_match", "commercial_calc", "sample_pipeline", "followup", "reorder_learning"] },
  { id: "07", key: "communication", name: "Communication", children: ["gmail", "line_oa", "notifications", "outreach", "followup_message"] },
  { id: "08", key: "security_credentials", name: "Security & Credentials", children: ["infisical", "auth", "scopes", "approval_gate", "secret_safe_diagnostics", "audit"] },
  { id: "09", key: "media_creative", name: "Media & Creative", children: ["image_generate", "image_edit", "figma", "magnific", "poster", "brand_assets", "ux_ui"] },
  { id: "10", key: "observability_control", name: "Observability & Control", children: ["runs", "agent_status", "connector_health", "quota_signal", "approvals", "failures", "retry_queue", "audit_log"] },
];

export const EXECUTION_SURFACES = [
  "OpenAI / ChatGPT", "Codex", "GitHub", "n8n", "Notion", "Google Drive",
  "Gmail / Calendar", "Linear", "Figma", "Magnific", "Shopify", "Vercel",
  "Cloudflare", "Infisical", "Web / Public Search", "Image Generation",
];

const READ_ONLY_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

function includesAny(text, terms) {
  return terms.some((term) => text.includes(term));
}

export function routeRequest(request) {
  const cleanRequest = String(request || "").trim();
  const text = cleanRequest.toLowerCase();
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
  } else if (includesAny(text, ["status", "health", "quota", "limit", "log", "error", "failure", "observability"])) {
    primary = "10.observability_control";
  }

  if (includesAny(text, [
    "delete", "ลบ", "production", "prod", "ส่งเลย", "ทักไป", "send now",
    "permission", "privilege", "secret", "credential", "deploy production",
    "payment", "financial", "ชำระ", "โอนเงิน",
  ])) {
    approval = "human_approval_required_before_consequential_action";
  }

  return {
    request: cleanRequest,
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

export function runtimeStatus() {
  return EXECUTION_SURFACES.map((name) => ({
    name,
    status: "unknown",
    verifiedAt: null,
    note: "No live health adapter has verified this surface in the MCP runtime.",
  }));
}

const capabilitySchema = z.object({
  id: z.string(), key: z.string(), name: z.string(), children: z.array(z.string()),
});
const routeSchema = z.object({
  request: z.string(),
  primary: z.string(),
  support: z.array(z.string()),
  approval: z.string(),
  executionPolicy: z.array(z.string()),
  verify: z.boolean(),
});
const surfaceSchema = z.object({
  name: z.string(),
  status: z.enum(["ready", "needs_auth", "rate_limited", "offline", "unknown", "error"]),
  verifiedAt: z.string().nullable(),
  note: z.string(),
});

export function createOgenicServer() {
  const server = new McpServer(
    { name: "ogenic-god-toolkit", version: VERSION },
    {
      capabilities: { tools: {}, resources: {} },
      instructions:
        "Route outcomes through the OGENIC capability index. Read before write, apply Human Approval before consequential actions, verify writes/sends/deploys, preserve provenance, never expose raw secrets, and never simulate successful execution.",
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
          _meta: {
            ui: {
              prefersBorder: false,
              csp: { connectDomains: [], resourceDomains: [] },
            },
            "openai/widgetDescription": "Mobile-first OGENIC Control Tower for routing, capability inspection, runtime status, approval state, Buyer Intent Radar state, recent local runs, and observability. Runtime surfaces remain Unknown until a live adapter verifies them.",
            "openai/widgetPrefersBorder": false,
          },
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
      outputSchema: { capabilities: z.array(capabilitySchema) },
      annotations: READ_ONLY_ANNOTATIONS,
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
      description: "Use this when the user wants OGENIC to classify a requested outcome into the minimum capability chain before execution. This plans only; it does not perform consequential actions.",
      inputSchema: { request: z.string().min(1).max(4000) },
      outputSchema: routeSchema.shape,
      annotations: READ_ONLY_ANNOTATIONS,
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
      description: "Use this when the user wants execution-surface status. A surface stays Unknown until a live health adapter verifies it; this tool never infers Ready from configuration alone.",
      inputSchema: {},
      outputSchema: { surfaces: z.array(surfaceSchema), verifiedReadyCount: z.number().int().nonnegative() },
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async () => {
      const surfaces = runtimeStatus();
      return {
        structuredContent: { surfaces, verifiedReadyCount: surfaces.filter((item) => item.status === "ready").length },
        content: [{ type: "text", text: "No live connector health adapters are wired yet, so execution-surface statuses are intentionally Unknown." }],
      };
    },
  );

  registerAppTool(
    server,
    "render_control_tower",
    {
      title: "Render OGENIC Control Tower",
      description: "Use this when the user wants the OGENIC Control Tower UI. It renders the current capability index and runtime snapshot; optionally pass a request to include a route preview.",
      inputSchema: { request: z.string().max(4000).optional() },
      outputSchema: {
        version: z.string(),
        router: z.object({ status: z.literal("verified"), verifiedBy: z.string() }),
        route: routeSchema.nullable(),
        capabilities: z.array(capabilitySchema),
        surfaces: z.array(surfaceSchema),
        buyerIntentRadar: z.object({ status: z.literal("unknown"), leads: z.array(z.object({ id: z.string(), sourceUrl: z.string(), sourceTimestamp: z.string(), score: z.number() })), note: z.string() }),
        recentRuns: z.array(z.object({ id: z.string(), status: z.string(), verifiedAt: z.string().nullable() })),
        approvals: z.array(z.object({ id: z.string(), action: z.string(), risk: z.string(), status: z.string() })),
      },
      annotations: READ_ONLY_ANNOTATIONS,
      _meta: {
        ui: { resourceUri: TEMPLATE_URI },
        "openai/toolInvocation/invoking": "Opening OGENIC Control Tower…",
        "openai/toolInvocation/invoked": "OGENIC Control Tower rendered.",
      },
    },
    async ({ request }) => ({
      structuredContent: {
        version: VERSION,
        router: { status: "verified", verifiedBy: "render_control_tower tool invocation" },
        route: request ? routeRequest(request) : null,
        capabilities: CAPABILITIES,
        surfaces: runtimeStatus(),
        buyerIntentRadar: {
          status: "unknown",
          leads: [],
          note: "No live Buyer Intent source adapter is connected to this MCP runtime. No leads are fabricated.",
        },
        recentRuns: [],
        approvals: [],
      },
      content: [{ type: "text", text: "Rendered OGENIC Control Tower. Router invocation is verified; connector readiness remains Unknown until live adapters verify it." }],
    }),
  );

  return server;
}

export function createHttpServer() {
  return createServer(async (req, res) => {
    if (!req.url) {
      res.writeHead(400).end("Missing URL");
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host ?? "localhost"}`);

    if (req.method === "OPTIONS" && url.pathname === "/mcp") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, GET, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "content-type, accept, mcp-session-id, mcp-protocol-version, authorization",
        "Access-Control-Expose-Headers": "Mcp-Session-Id, MCP-Protocol-Version",
      });
      res.end();
      return;
    }

    if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/healthz")) {
      res.writeHead(200, { "content-type": "application/json; charset=utf-8" }).end(JSON.stringify({
        name: "ogenic-god-toolkit",
        version: VERSION,
        mcp: "/mcp",
        status: "ok",
        scope: "staging-compatible",
      }));
      return;
    }

    const MCP_METHODS = new Set(["POST", "GET", "DELETE"]);
    if (url.pathname === "/mcp" && req.method && MCP_METHODS.has(req.method)) {
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
        console.error("Error handling MCP request:", error);
        if (!res.headersSent) res.writeHead(500).end("Internal server error");
      }
      return;
    }

    res.writeHead(404).end("Not Found");
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const port = Number(process.env.PORT ?? 8787);
  createHttpServer().listen(port, () => {
    console.log(`OGENIC GOD TOOLKIT listening on http://localhost:${port}/mcp`);
  });
}
