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

export const VERSION = "1.3.2";
export const TEMPLATE_URI = "ui://ogenic/control-tower-v1.3.0.html";
const __dirname = dirname(fileURLToPath(import.meta.url));
const controlTowerHtml = readFileSync(join(__dirname, "public", "control-tower.html"), "utf8");

export const CAPABILITIES = [
  { id: "00", key: "core_router", name: "Core / Auto Router", children: ["intent", "decompose", "tool_discovery", "execution_selection", "approval_classification", "verification", "audit"] },
  { id: "01", key: "code_build", name: "Code & Build", children: ["repo_inspect", "patch", "git", "branch", "test", "lint", "typecheck", "build", "pr", "codex_delegate", "claude_review", "agent_handoff"] },
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
  "OpenAI / ChatGPT", "Codex", "Claude / Anthropic", "GitHub", "n8n", "Notion", "Google Drive",
  "Gmail / Calendar", "Linear", "Figma", "Magnific", "Shopify", "Vercel",
  "Cloudflare", "Infisical", "Web / Public Search", "Image Generation",
];

const READ_ONLY_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

const WRITE_IDEMPOTENT_ANNOTATIONS = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
};

const ONE_LSS_CONVERSATION_ID = "owner-main";
const ONE_LSS_SESSION_LINE = "1LSS_OWNER_MAIN";
const ONE_LSS_SOURCE_SURFACES = new Set(["chatgpt-app", "plugin-harness"]);

function cleanWriterValue(value, max) {
  return String(value ?? "").trim().slice(0, max);
}

function safeBridgeCode(value) {
  return cleanWriterValue(value, 80).toUpperCase().replace(/[^A-Z0-9_:-]/g, "_") || "UNKNOWN";
}

export async function append1LssEvent(
  { turnId, role, content, sourceSurface, model },
  {
    fetchImpl = fetch,
    baseUrl = process.env.OGENIC_1LSS_BASE_URL || process.env.OGENIC_PHASE_VI_STAGING_URL || process.env.OGENIC_1LSS_URL,
    opsKey = process.env.OGENIC_OPS_KEY,
  } = {},
) {
  const normalizedBaseUrl = cleanWriterValue(baseUrl, 2048).replace(/\/+$/, "");
  const normalizedOpsKey = cleanWriterValue(opsKey, 4096);
  const normalizedTurnId = cleanWriterValue(turnId, 180);
  const normalizedRole = cleanWriterValue(role, 20).toLowerCase();
  const normalizedContent = cleanWriterValue(content, 7000);
  const normalizedSource = cleanWriterValue(sourceSurface, 60).toLowerCase();
  const normalizedModel = cleanWriterValue(model, 100) || null;

  if (!normalizedBaseUrl) throw new Error("1LSS_BRIDGE_URL_NOT_CONFIGURED");
  if (!normalizedOpsKey) throw new Error("1LSS_BRIDGE_AUTH_NOT_CONFIGURED");
  if (!normalizedTurnId) throw new Error("1LSS_TURN_ID_REQUIRED");
  if (!["user", "assistant", "system"].includes(normalizedRole)) throw new Error("1LSS_INVALID_ROLE");
  if (!normalizedContent) throw new Error("1LSS_CONTENT_REQUIRED");
  if (!ONE_LSS_SOURCE_SURFACES.has(normalizedSource)) throw new Error("1LSS_INVALID_SOURCE_SURFACE");

  const idempotencyKey = `mcp:${normalizedSource}:${normalizedTurnId}`;
  const response = await fetchImpl(`${normalizedBaseUrl}/api/1lss/event`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-ogenic-ops-key": normalizedOpsKey,
      "idempotency-key": idempotencyKey,
    },
    body: JSON.stringify({
      source_surface: normalizedSource,
      events: [{
        role: normalizedRole,
        content: normalizedContent,
        model: normalizedModel,
      }],
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok !== true) {
    throw new Error(`1LSS_BRIDGE_HTTP_${response.status}_${safeBridgeCode(payload?.code)}`);
  }

  const sequences = Array.isArray(payload.sequences) ? payload.sequences.map(Number) : [];
  const sequenceNo = sequences.length === 1 ? sequences[0] : NaN;
  if (
    payload.conversation_id !== ONE_LSS_CONVERSATION_ID ||
    payload.session_line !== ONE_LSS_SESSION_LINE ||
    payload.source_surface !== normalizedSource ||
    !Number.isInteger(sequenceNo) ||
    sequenceNo <= 0
  ) {
    throw new Error("1LSS_BRIDGE_CONTRACT_MISMATCH");
  }

  return {
    ok: true,
    conversation_id: ONE_LSS_CONVERSATION_ID,
    session_line: ONE_LSS_SESSION_LINE,
    source_surface: normalizedSource,
    sequence_no: sequenceNo,
    replayed: Number(payload.replayed_count ?? 0) > 0,
  };
}

const APPROVAL_STATES = [
  "auto",
  "auto_with_review",
  "human_approval_required_before_consequential_action",
];

function includesAny(text, terms) {
  return terms.some((term) => text.includes(term));
}

function matchesAny(text, patterns) {
  return patterns.some((pattern) => pattern.test(text));
}

function isDiagnosticIntent(text) {
  return /\b(?:read[- ]only|analysis[- ]only|diagnostic|readiness|check|verify|inspect|status|health|observe|observation)\b|ตรวจ|เช็ก|สถานะ|ตรวจสอบ/i.test(text);
}

function stripNegatedSafetyConstraints(text) {
  return String(text)
    .replace(/\b(?:do\s+not|don't|never)\b[^.!?;\n]{0,180}/gi, " ")
    .replace(/\bwithout\b[^.!?;\n]{0,140}/gi, " ")
    .replace(/(?:ห้าม|อย่า|ไม่ให้)[^.!?;\n]{0,140}/gi, " ");
}

export function classifyApproval(text) {
  const raw = String(text || "");
  const candidate = isDiagnosticIntent(raw) ? stripNegatedSafetyConstraints(raw) : raw;
  const humanApprovalPatterns = [
    /\bdeploy\s+(?:to\s+)?production(?:\s+(?:now|today|immediately|please))?\b/i,
    /\bmerge\s+(?:into\s+)?main\b/i,
    /\bmerge\s+main\b/i,
    /\bpublish\s+(?:to\s+the\s+)?public(?:ly)?\b/i,
    /\bpublic\s+publish\s+now\b/i,
    /\bgo\s+live\b/i,
    /\b(delete|destroy|purge|wipe|drop)\b/i,
    /ลบ|ทำลาย/,
    /\b(grant|revoke|change|update|set|add|remove)\b.{0,40}\b(permission|privilege|role|access|scope)\b/i,
    /\b(permission|privilege|role|access|scope)\b.{0,40}\b(grant|revoke|change|update|set|add|remove)\b/i,
    /เปลี่ยนสิทธิ์|เพิ่มสิทธิ์|ถอนสิทธิ์|เปลี่ยน role|เปลี่ยน scope/i,
    /\b(create|rotate|replace|revoke|delete|change|update)\b.{0,40}\b(secret|credential|token|api\s*key|key)\b/i,
    /\b(secret|credential|token|api\s*key)\b.{0,40}\b(create|rotate|replace|revoke|delete|change|update)\b/i,
    /เปลี่ยนคีย์|หมุนคีย์|ลบคีย์|สร้างคีย์ใหม่|เปลี่ยน secret|ลบ secret/i,
    /\b(send\s+now|contact\s+now|send\s+email|send\s+message)\b/i,
    /\b(?:contact|reach\s+out\s+to)\s+(?:a\s+|the\s+)?(?:lead|prospect|customer)\b/i,
    /ส่งเลย|ทักไป|ส่งเมลเลย|ส่งข้อความเลย/,
    /\b(?:make|send|execute|initiate|process|submit|approve)\s+(?:a\s+|the\s+)?(?:payment|transfer|purchase|refund|charge)\b/i,
    /\b(?:pay|transfer|refund|charge)\s+(?:the\s+)?(?:customer|vendor|invoice|account|card|order|\$|usd|thb|baht|\d)/i,
    /\b(?:buy|purchase)\s+(?:this|that|the)\b/i,
    /\b(?:payment|transfer|purchase|refund|charge)\b.{0,30}\b(?:now|immediately|execute|initiate|process|submit|approve|send)\b/i,
    /(?:ชำระเงิน|โอนเงิน|ซื้อสินค้า|คืนเงิน)(?:ให้|ไป|เลย|ตอนนี้|ทันที|จำนวน|ลูกค้า|บัญชี)/i,
    /(?:ชำระเงิน|โอนเงิน|ซื้อสินค้า|คืนเงิน)\s*\d+/i,
    /เรียกเก็บเงิน(?:จาก|ลูกค้า|เลย|ตอนนี้|ทันที|จำนวน)/i,
  ];

  if (matchesAny(candidate, humanApprovalPatterns)) {
    return "human_approval_required_before_consequential_action";
  }

  const autoReviewPatterns = [
    /\b(?:deploy|release)\b.{0,30}\b(?:staging|preview|sandbox)\b/i,
    /\b(?:staging|preview|sandbox)\b.{0,30}\b(?:deploy|release)\b/i,
    /\b(patch|commit|draft\s+pr|pull\s+request|ci\s+retry|retry\s+ci|codex|claude|code\s+review|review\s+code|fix\s+ci|fix\s+test)\b/i,
    /แก้โค้ด|ตรวจโค้ด|รีวิวโค้ด|ดีพลอย staging|ดีพลอย preview|รัน ci ใหม่|แก้ test/i,
  ];

  if (matchesAny(candidate, autoReviewPatterns)) {
    return "auto_with_review";
  }

  return "auto";
}

export function routeRequest(request) {
  const cleanRequest = String(request || "").trim();
  const text = cleanRequest.toLowerCase();
  const routingText = isDiagnosticIntent(text) ? stripNegatedSafetyConstraints(text).toLowerCase() : text;
  let primary = "00.core_router";
  const support = [];
  const approval = classifyApproval(text);

  if (isDiagnosticIntent(text)) {
    primary = "10.observability_control";
    if (includesAny(routingText, ["github", "repo", "code", "pr "])) support.push("01.code_build");
    if (includesAny(routingText, ["vercel", "website", "web", "เว็บ", "deploy"])) support.push("04.web_app");
  } else if (includesAny(routingText, ["supplier", "ซัพพลายเออร์", "หาขนม", "lead", "ขายส่ง", "wholesale", "ลูกค้า", "ร้านกาแฟ", "คาเฟ่"])) {
    primary = "06.business_sales";
    support.push("05.data_knowledge");
  } else if (includesAny(routingText, ["figma", "poster", "โปสเตอร์", "image", "รูป", "ux", "ui", "design"])) {
    primary = "09.media_creative";
    support.push("05.data_knowledge");
  } else if (includesAny(routingText, ["cloudflare", "website", "เว็บ", "frontend", "backend", "vercel", "d1"])) {
    primary = "04.web_app";
    support.push("01.code_build");
  } else if (includesAny(routingText, ["n8n", "workflow", "schedule", "automation", "webhook", "deploy", "ci/cd", "ci "])) {
    primary = "03.automation_delivery";
    support.push("01.code_build");
  } else if (includesAny(routingText, ["github", "repo", "code", "bug", "test", "build", "codex", "claude", "review", "ตรวจโค้ด", "pr "])) {
    primary = "01.code_build";
  } else if (includesAny(routingText, ["drive", "notion", "rag", "ไฟล์", "product master", "registry"])) {
    primary = "05.data_knowledge";
  } else if (includesAny(routingText, ["gmail", "email", "line", "ข้อความ", "ทัก", "ส่งเมล", "outreach"])) {
    primary = "07.communication";
  } else if (includesAny(routingText, ["secret", "infisical", "auth", "permission", "credential", "token", "api key"])) {
    primary = "08.security_credentials";
  }

  return {
    request: cleanRequest,
    primary,
    support: [...new Set(support)],
    approval,
    executionPolicy: [
      "connected ChatGPT host tool first; direct MCP credential is optional when host execution is verified",
      "allowlisted internal model-to-model analysis/review without Human Approval",
      "authorized hosted agent/runtime for implementation-heavy work",
      "auto-review feature-branch/staging changes before success",
      "Human Approval only immediately before consequential external/production/security/financial actions",
      "orchestrator for repeatable multi-service flow",
      "never claim an unavailable execution surface ran",
    ],
    verify: true,
  };
}

function baseSurface(name) {
  return {
    name,
    status: "unknown",
    note: "No live health adapter has verified this surface in the MCP runtime.",
  };
}

function responseToStatus(response) {
  if (response.status === 401 || response.status === 403) return "needs_auth";
  if (response.status === 429) return "rate_limited";
  if (response.status >= 500) return "offline";
  return "error";
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  try {
    return await fetch(url, { ...options, signal: controller.signal, redirect: "error" });
  } finally {
    clearTimeout(timeout);
  }
}

async function verifyGitHubSurface() {
  const token = process.env.OGENIC_GITHUB_TOKEN || process.env.GITHUB_TOKEN;
  const repo = process.env.OGENIC_GITHUB_REPO || "Ogenicchocolate21debug/Build-Platform";
  const [expectedOwner, expectedSlug] = repo.split("/");

  if (token) {
    try {
      const response = await fetchWithTimeout(`https://api.github.com/repos/${repo}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "ogenic-god-toolkit",
        },
      });
      if (response.ok) {
        const data = await response.json();
        return { name: "GitHub", status: "ready", mode: "direct_api", verifiedAt: new Date().toISOString(), note: `Verified direct API read access to ${data.full_name || repo}.` };
      }
    } catch {
      // Fall through to deployment-provenance verification.
    }
  }

  const gitProvider = process.env.VERCEL_GIT_PROVIDER;
  const gitOwner = process.env.VERCEL_GIT_REPO_OWNER;
  const gitSlug = process.env.VERCEL_GIT_REPO_SLUG;
  const gitSha = process.env.VERCEL_GIT_COMMIT_SHA;
  if (gitProvider === "github" && gitOwner === expectedOwner && gitSlug === expectedSlug && gitSha) {
    return {
      name: "GitHub",
      status: "ready",
      mode: "host_connector",
      verifiedAt: new Date().toISOString(),
      note: `Verified GitHub→Vercel deployment provenance for ${repo} at ${gitSha.slice(0, 7)}. Repository operations are delegated to the connected ChatGPT GitHub execution surface; no long-lived PAT is required in this MCP runtime.`,
    };
  }

  return {
    name: "GitHub",
    status: token ? "needs_auth" : "unknown",
    mode: token ? "direct_api" : "host_connector",
    verifiedAt: new Date().toISOString(),
    note: token
      ? "Direct GitHub credential did not verify and no matching GitHub deployment provenance was available."
      : "No direct GitHub token is required by design; waiting for GitHub deployment provenance or a connected host GitHub execution surface.",
  };
}

async function verifyVercelSurface() {
  const token = process.env.OGENIC_VERCEL_TOKEN || process.env.VERCEL_TOKEN;
  const projectId = process.env.OGENIC_VERCEL_PROJECT_ID || "prj_lOOm1o5AKF2bi0WfPFdCQ4jtGSqW";
  const teamId = process.env.OGENIC_VERCEL_TEAM_ID || "team_bSBITacYbWsQJPDk7VMZ51w6";

  if (token) {
    try {
      const response = await fetchWithTimeout(`https://api.vercel.com/v9/projects/${projectId}?teamId=${encodeURIComponent(teamId)}`, {
        headers: { Authorization: `Bearer ${token}`, "User-Agent": "ogenic-god-toolkit" },
      });
      if (response.ok) {
        const data = await response.json();
        return { name: "Vercel", status: "ready", mode: "direct_api", verifiedAt: new Date().toISOString(), note: `Verified direct API read access to Vercel project ${data.name || projectId}.` };
      }
    } catch {
      // Fall through to runtime-provenance verification.
    }
  }

  const vercelRuntime = process.env.VERCEL === "1" || Boolean(process.env.VERCEL_ENV || process.env.VERCEL_URL);
  if (vercelRuntime) {
    const environment = process.env.VERCEL_ENV || "vercel";
    const deploymentUrl = process.env.VERCEL_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL || "current deployment";
    return {
      name: "Vercel",
      status: "ready",
      mode: "git_runtime",
      verifiedAt: new Date().toISOString(),
      note: `Verified this MCP is executing on Vercel (${environment}) at ${deploymentUrl}. Deployments use the Git integration; admin/project operations are delegated to the connected ChatGPT Vercel execution surface, so a long-lived Vercel API token is optional.`,
    };
  }

  return {
    name: "Vercel",
    status: token ? "needs_auth" : "unknown",
    mode: token ? "direct_api" : "git_runtime",
    verifiedAt: new Date().toISOString(),
    note: token
      ? "Direct Vercel credential did not verify and the runtime is not currently executing on Vercel."
      : "No long-lived Vercel token is required by design; waiting for Vercel runtime provenance or a connected host Vercel execution surface.",
  };
}

export async function runtimeStatus() {
  const surfaces = EXECUTION_SURFACES.map(baseSurface);
  const verified = await Promise.all([verifyGitHubSurface(), verifyVercelSurface()]);
  for (const result of verified) {
    const index = surfaces.findIndex((item) => item.name === result.name);
    if (index >= 0) surfaces[index] = result;
  }
  return surfaces;
}

const capabilitySchema = z.object({
  id: z.string(), key: z.string(), name: z.string(), children: z.array(z.string()),
});
const routeSchema = z.object({
  request: z.string(),
  primary: z.string(),
  support: z.array(z.string()),
  approval: z.enum(APPROVAL_STATES),
  executionPolicy: z.array(z.string()),
  verify: z.boolean(),
});
const surfaceSchema = z.object({
  name: z.string(),
  status: z.enum(["ready", "needs_auth", "rate_limited", "offline", "unknown", "error"]),
  verifiedAt: z.string().optional(),
  note: z.string(),
  mode: z.enum(["direct_api", "host_connector", "git_runtime"]).optional(),
});

const oneLssSyncSchema = z.object({
  ok: z.boolean(),
  conversation_id: z.string().optional(),
  session_line: z.string().optional(),
  source_surface: z.string().optional(),
  sequence_no: z.number().int().positive().optional(),
  replayed: z.boolean().optional(),
  error: z.string().optional(),
});

export function createOgenicServer() {
  const server = new McpServer(
    { name: "ogenic-god-toolkit", version: VERSION },
    {
      capabilities: { tools: {}, resources: {} },
      instructions:
        "Route outcomes through the OGENIC capability index. Prefer connected ChatGPT host tools for provider execution so long-lived provider tokens are not required inside this MCP runtime. Read before write. Allow approved internal agent/model review to run automatically. Use AUTO + REVIEW for feature-branch, CI and staging work. Apply Human Approval only immediately before consequential external sends, destructive mutations, production/merge, permission/credential mutations, financial actions or comparable irreversible effects. Verify writes/sends/deploys, preserve provenance, never expose raw secrets, and never simulate successful execution.",
    },
  );

  registerAppResource(
    server,
    "ogenic-control-tower",
    TEMPLATE_URI,
    {},
    async () => ({
      contents: [{
        uri: TEMPLATE_URI,
        mimeType: RESOURCE_MIME_TYPE,
        text: controlTowerHtml,
        _meta: {
          ui: { prefersBorder: false, csp: { connectDomains: [], resourceDomains: [] } },
          "openai/widgetDescription": "Mobile-first OGENIC Control Tower for routing, capability inspection, runtime status, approval state, Buyer Intent Radar state, recent local runs, and observability. Runtime surfaces are evidence-based and only become Ready after a live adapter verifies them.",
          "openai/widgetPrefersBorder": false,
        },
      }],
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
      _meta: {},
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
      _meta: {},
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
      description: "Use this when the user wants execution-surface status. GitHub and Vercel can verify through direct API credentials or through Vercel/Git deployment provenance plus connected ChatGPT host execution surfaces; other surfaces stay Unknown until verified.",
      inputSchema: {},
      outputSchema: { surfaces: z.array(surfaceSchema), verifiedReadyCount: z.number().int().nonnegative() },
      annotations: READ_ONLY_ANNOTATIONS,
      _meta: {},
    },
    async () => {
      const surfaces = await runtimeStatus();
      const verifiedReadyCount = surfaces.filter((item) => item.status === "ready").length;
      return {
        structuredContent: { surfaces, verifiedReadyCount },
        content: [{ type: "text", text: verifiedReadyCount > 0 ? `Verified ${verifiedReadyCount} live execution surface(s).` : "Live GitHub/Vercel adapters are installed but no surface has verified Ready in this runtime yet." }],
      };
    },
  );

  registerAppTool(
    server,
    "sync_1lss_turn",
    {
      title: "Sync turn to OGENIC 1LSS",
      description: "Persist one ChatGPT/plugin turn into the canonical OGENIC owner-main line. Use one stable turn_id for the immutable turn and reuse it on retries. This writes only to the existing 1LSS bridge; it does not create a session or D1 conversation.",
      inputSchema: {
        turn_id: z.string().min(8).max(180),
        role: z.enum(["user", "assistant", "system"]).default("user"),
        content: z.string().min(1).max(7000),
        source_surface: z.enum(["chatgpt-app", "plugin-harness"]).default("chatgpt-app"),
        model: z.string().max(100).optional(),
      },
      outputSchema: oneLssSyncSchema.shape,
      annotations: WRITE_IDEMPOTENT_ANNOTATIONS,
      _meta: {
        "openai/toolInvocation/invoking": "Syncing turn to OGENIC 1LSS…",
        "openai/toolInvocation/invoked": "OGENIC 1LSS turn synced.",
      },
    },
    async ({ turn_id, role, content, source_surface, model }) => {
      try {
        const result = await append1LssEvent({
          turnId: turn_id,
          role,
          content,
          sourceSurface: source_surface,
          model,
        });
        return {
          structuredContent: result,
          content: [{ type: "text", text: `Synced to owner-main sequence ${result.sequence_no}${result.replayed ? " (idempotent replay)" : ""}.` }],
        };
      } catch (error) {
        const result = {
          ok: false,
          error: safeBridgeCode(error instanceof Error ? error.message : "1LSS_SYNC_FAILED"),
        };
        return {
          structuredContent: result,
          content: [{ type: "text", text: `1LSS sync failed: ${result.error}` }],
          isError: true,
        };
      }
    },
  );

  registerAppTool(
    server,
    "render_control_tower",
    {
      title: "Render OGENIC Control Tower",
      description: "Use this when the user wants the OGENIC Control Tower UI. For a route preview, call route_request first and pass its complete structured route here; this render tool does not repeat routing or execute actions.",
      inputSchema: { route: routeSchema.optional() },
      outputSchema: {
        version: z.string(),
        router: z.object({ status: z.literal("verified"), verifiedBy: z.string() }),
        route: routeSchema.nullable(),
        capabilities: z.array(capabilitySchema),
        surfaces: z.array(surfaceSchema),
        buyerIntentRadar: z.object({ status: z.literal("unknown"), leads: z.array(z.object({ id: z.string(), sourceUrl: z.string(), sourceTimestamp: z.string(), score: z.number() })), note: z.string() }),
        recentRuns: z.array(z.object({ id: z.string(), status: z.string(), verifiedAt: z.string().optional() })),
        approvals: z.array(z.object({ id: z.string(), action: z.string(), risk: z.string(), status: z.literal("pending_human_approval") })),
      },
      annotations: READ_ONLY_ANNOTATIONS,
      _meta: {
        ui: { resourceUri: TEMPLATE_URI },
        "openai/toolInvocation/invoking": "Opening OGENIC Control Tower…",
        "openai/toolInvocation/invoked": "OGENIC Control Tower rendered.",
      },
    },
    async ({ route }) => {
      const approvals = route?.approval === "human_approval_required_before_consequential_action"
        ? [{ id: "route-preview", action: route.request, risk: "consequential", status: "pending_human_approval" }]
        : [];
      const surfaces = await runtimeStatus();
      return {
        structuredContent: {
          version: VERSION,
          router: { status: "verified", verifiedBy: "render_control_tower tool invocation" },
          route: route ?? null,
          capabilities: CAPABILITIES,
          surfaces,
          buyerIntentRadar: {
            status: "unknown",
            leads: [],
            note: "No live Buyer Intent source adapter is connected to this MCP runtime. No leads are fabricated.",
          },
          recentRuns: [],
          approvals,
        },
        content: [{ type: "text", text: "Rendered OGENIC Control Tower with evidence-based runtime status." }],
      };
    },
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
    const isMcpPath = url.pathname === "/mcp" || url.pathname === "/api/mcp";
    const isHealthPath = ["/", "/healthz", "/api/health"].includes(url.pathname);

    if (req.method === "OPTIONS" && isMcpPath) {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, GET, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "content-type, accept, mcp-session-id, mcp-protocol-version, authorization",
        "Access-Control-Expose-Headers": "Mcp-Session-Id, MCP-Protocol-Version",
      });
      res.end();
      return;
    }

    if (req.method === "GET" && isHealthPath) {
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
    if (isMcpPath && req.method && MCP_METHODS.has(req.method)) {
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

const httpServer = createHttpServer();
export default httpServer;

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const port = Number(process.env.PORT ?? 8787);
  httpServer.listen(port, () => {
    console.log(`OGENIC GOD TOOLKIT listening on http://localhost:${port}/mcp`);
  });
}
