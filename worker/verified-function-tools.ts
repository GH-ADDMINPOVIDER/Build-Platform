import type { ConnectorD1 } from "./connector-runtime";
import { readConnectorRegistry, type ConnectorBindings } from "./connector-runtime";
import { readCanonicalD1Context } from "./d1-context";
import { readCertificateLincenc } from "./certificate-lincenc-registry";

export const CANONICAL_REPOSITORY = "Wave-Runner-2/Build-Platform";
export const CANONICAL_BRANCH = "phase-vi-provider-incentive-metering";
export const CANONICAL_CONVERSATION = "owner-main";
export const CANONICAL_SESSION = "1LSS_OWNER_MAIN";

export type VerifiedToolBindings = ConnectorBindings & {
  OGENIC_GIT_SHA?: string;
  OGENIC_BUILD_UUID?: string;
  OGENIC_RUNTIME?: string;
  OGENIC_PHASE?: string;
  CF_VERSION_METADATA?: { id?: string; tag?: string; timestamp?: string };
};

type JsonSchema = Record<string, unknown>;
type ToolDefinition = { type: "function"; name: string; description: string; strict: true; parameters: JsonSchema };

const noArguments = { type: "object", properties: {}, required: [], additionalProperties: false };
export const verifiedFunctionTools: ToolDefinition[] = [
  { type: "function", name: "ogenic_system_status", description: "Read sanitized OGENIC staging runtime and connector status.", strict: true, parameters: noArguments },
  { type: "function", name: "github_staging_status", description: "Read the canonical private repository staging branch head and recent workflow runs.", strict: true, parameters: noArguments },
  { type: "function", name: "github_fetch_file", description: "Read one UTF-8 file from the locked canonical staging branch.", strict: true, parameters: { type: "object", properties: { path: { type: "string", minLength: 1, maxLength: 500 } }, required: ["path"], additionalProperties: false } },
  { type: "function", name: "linear_recent_issues", description: "Read recently updated Linear issues.", strict: true, parameters: { type: "object", properties: { limit: { type: "integer", minimum: 1, maximum: 25 } }, required: ["limit"], additionalProperties: false } },
  { type: "function", name: "linear_get_issue", description: "Read one Linear issue by identifier, for example OGE-32.", strict: true, parameters: { type: "object", properties: { identifier: { type: "string", pattern: "^[A-Za-z][A-Za-z0-9]*-[0-9]+$", maxLength: 40 } }, required: ["identifier"], additionalProperties: false } },
  { type: "function", name: "lss_recent_turns", description: "Read recent turns from locked owner-main / 1LSS_OWNER_MAIN canonical continuity.", strict: true, parameters: { type: "object", properties: { limit: { type: "integer", minimum: 1, maximum: 30 } }, required: ["limit"], additionalProperties: false } },
  { type: "function", name: "yellowstone_status", description: "Read Yellow Stone capability resolver and policy state without execution.", strict: true, parameters: noArguments },
  { type: "function", name: "certificate_lincenc_status", description: "Read the original OGENIC Certificate lincenc authorization evidence registry from live D1. NOT a Vercel SSL/TLS certificate, current OAuth scope, or live runtime E2E.", strict: true, parameters: noArguments },
];

const names = new Set(verifiedFunctionTools.map((tool) => tool.name));
const clip = (value: unknown, max = 500) => String(value ?? "").trim().slice(0, max);
const secretKey = /(authorization|cookie|credential|password|private.?key|secret|token|api.?key)/i;
const secretValue = /(bearer\s+[a-z0-9._~+/=-]+|gh[pousr]_[a-z0-9_]+|sk-[a-z0-9_-]{12,})/gi;
const secretAssignment = /((?:[\w.-]*(?:password|secret|token|api[_-]?key|credential)[\w.-]*)["']?\s*[:=]\s*)(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s,;\r\n}]+)/gi;
const privateKey = /-----BEGIN [^-\r\n]*PRIVATE KEY-----[\s\S]*?(?:-----END [^-\r\n]*PRIVATE KEY-----|$)/g;

function sanitized(value: unknown, depth = 0, bindings: string[] = []): unknown {
  if (depth > 7) return "[TRUNCATED]";
  if (typeof value === "string") {
    let output = value;
    for (const binding of bindings) output = output.split(binding).join("[REDACTED]");
    return output.replace(privateKey, "[REDACTED]").replace(secretValue, "[REDACTED]").replace(secretAssignment, "$1[REDACTED]").slice(0, 12_000);
  }
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => sanitized(item, depth + 1, bindings));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).slice(0, 100).map(([key, item]) => [key, secretKey.test(key) ? "[REDACTED]" : sanitized(item, depth + 1, bindings)]));
  return value;
}

function envelope(tool: string, data: unknown, checkedAt = new Date().toISOString()) {
  return { ok: true, tool, verified: true, read_only: true, checked_at: checkedAt, data };
}
function invalid(message: string) { return { ok: false, code: "INVALID_TOOL_ARGUMENTS", verified: false, read_only: true, message }; }
function upstreamReadFailure(provider: string, status: number) {
  if (status === 401 || status === 403) {
    return {
      ok: false,
      code: "REAUTH_REQUIRED",
      provider,
      http_status: status,
      verified: false,
      read_only: true,
      message: `${provider} read credential was rejected; refresh the server-side credential before fresh verification.`,
    };
  }
  return { ok: false, code: "UPSTREAM_READ_FAILED", provider, http_status: status, verified: false, read_only: true };
}

async function requestJson(url: string, init: RequestInit) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const body = await response.json().catch(() => ({})) as Record<string, unknown>;
    return response.ok ? { ok: true as const, status: response.status, body } : { ok: false as const, status: response.status, body };
  } finally { clearTimeout(timer); }
}

function githubHeaders(token: string) {
  return { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "User-Agent": "ogenic-phase-vi-staging", "X-GitHub-Api-Version": "2022-11-28" };
}

async function githubStatus(env: VerifiedToolBindings) {
  const token = clip(env.GITHUB_TOKEN, 4000);
  if (!token) return { ok: false, code: "CONFIGURATION_REQUIRED", missing: "GITHUB_TOKEN", verified: false, read_only: true };
  const base = `https://api.github.com/repos/${CANONICAL_REPOSITORY}`;
  const [branch, runs] = await Promise.all([
    requestJson(`${base}/branches/${encodeURIComponent(CANONICAL_BRANCH)}`, { headers: githubHeaders(token) }),
    requestJson(`${base}/actions/runs?branch=${encodeURIComponent(CANONICAL_BRANCH)}&per_page=5`, { headers: githubHeaders(token) }),
  ]);
  if (!branch.ok || !runs.ok) return upstreamReadFailure("github", !branch.ok ? branch.status : runs.status);
  const commit = (branch.body.commit ?? {}) as Record<string, unknown>;
  const workflowRuns = Array.isArray(runs.body.workflow_runs) ? runs.body.workflow_runs as Array<Record<string, unknown>> : [];
  return envelope("github_staging_status", { repository: CANONICAL_REPOSITORY, branch: CANONICAL_BRANCH, head_sha: clip(commit.sha, 80), protected: branch.body.protected === true, workflow_runs: workflowRuns.slice(0, 5).map((run) => ({ id: clip(run.id, 80), name: clip(run.name, 160), status: clip(run.status, 40), conclusion: clip(run.conclusion, 40) || null, url: clip(run.html_url, 500) })) });
}

async function githubFile(env: VerifiedToolBindings, path: string) {
  const token = clip(env.GITHUB_TOKEN, 4000);
  if (!token) return { ok: false, code: "CONFIGURATION_REQUIRED", missing: "GITHUB_TOKEN", verified: false, read_only: true };
  if (!path || path.startsWith("/") || path.includes("..") || path.includes("\\") || /[\x00-\x1f\x7f]/.test(path) || /(^|\/)(?:\.env(?:\.[^/]*)?|(?:secrets?|credentials?)(?:\.[^/]*)?|id_(?:rsa|ed25519)|[^/]+\.(?:pem|key|p12|pfx))(\/|$)/i.test(path)) return invalid("path must be a safe repository-relative non-secret file");
  const result = await requestJson(`https://api.github.com/repos/${CANONICAL_REPOSITORY}/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(CANONICAL_BRANCH)}`, { headers: githubHeaders(token) });
  if (!result.ok) return upstreamReadFailure("github", result.status);
  if (result.body.type !== "file" || result.body.encoding !== "base64") return { ok: false, code: "FILE_NOT_READABLE", verified: false, read_only: true };
  let content = "";
  try { content = new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(atob(String(result.body.content ?? "").replace(/\s/g, "")), (char) => char.charCodeAt(0))); } catch { return { ok: false, code: "FILE_DECODE_FAILED", verified: false, read_only: true }; }
  return envelope("github_fetch_file", { repository: CANONICAL_REPOSITORY, branch: CANONICAL_BRANCH, path, sha: clip(result.body.sha, 80), size: Number(result.body.size ?? 0), content: content.slice(0, 20_000), truncated: content.length > 20_000 });
}

async function linearQuery(env: VerifiedToolBindings, query: string, variables: Record<string, unknown>) {
  const token = clip(env.LINEAR_API_KEY, 4000);
  if (!token) return { ok: false as const, error: { ok: false, code: "CONFIGURATION_REQUIRED", missing: "LINEAR_API_KEY", verified: false, read_only: true } };
  const result = await requestJson("https://api.linear.app/graphql", { method: "POST", headers: { Authorization: token, "Content-Type": "application/json" }, body: JSON.stringify({ query, variables }) });
  if (!result.ok) return { ok: false as const, error: upstreamReadFailure("linear", result.status) };
  if (Array.isArray(result.body.errors)) return { ok: false as const, error: { ok: false, code: "UPSTREAM_READ_FAILED", provider: "linear", http_status: result.status, verified: false, read_only: true } };
  return { ok: true as const, data: (result.body.data ?? {}) as Record<string, unknown> };
}

export async function executeVerifiedTool(name: string, args: unknown, env: VerifiedToolBindings): Promise<Record<string, unknown>> {
  const bindings = Object.entries(env).filter(([key, value]) => secretKey.test(key) && typeof value === "string" && value.length > 0).map(([, value]) => String(value)).sort((a, b) => b.length - a.length);
  try {
    return sanitized(await dispatchVerifiedTool(name, args, env), 0, bindings) as Record<string, unknown>;
  } catch {
    return { ok: false, code: "UPSTREAM_READ_FAILED", verified: false, read_only: true };
  }
}

async function dispatchVerifiedTool(name: string, args: unknown, env: VerifiedToolBindings): Promise<Record<string, unknown>> {
  if (!names.has(name)) return { ok: false, code: "HUMAN_APPROVAL_REQUIRED", verified: false, read_only: true, message: "Only registered read-only tools may execute; writes and unknown functions fail closed." };
  if (!args || typeof args !== "object" || Array.isArray(args)) return invalid("arguments must be an object");
  const input = args as Record<string, unknown>;
  const allowed = name === "github_fetch_file" ? ["path"] : name === "linear_get_issue" ? ["identifier"] : (name === "linear_recent_issues" || name === "lss_recent_turns") ? ["limit"] : [];
  if (Object.keys(input).some((key) => !allowed.includes(key))) return invalid("unknown argument");
  if (name === "certificate_lincenc_status") {
    const evidence = await readCertificateLincenc(env.DB);
    return evidence.ok ? envelope(name, evidence) : { ...evidence, verified:false };
  }
  if (name === "github_staging_status") return githubStatus(env);
  if (name === "github_fetch_file") return githubFile(env, clip(input.path, 500));
  if (name === "linear_recent_issues") {
    const limit = Number(input.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 25) return invalid("limit must be an integer from 1 to 25");
    const result = await linearQuery(env, "query RecentIssues($first: Int!) { issues(first: $first, orderBy: updatedAt) { nodes { identifier title url updatedAt state { name } assignee { name } } } }", { first: limit });
    return result.ok ? envelope(name, result.data) : result.error;
  }
  if (name === "linear_get_issue") {
    const identifier = clip(input.identifier, 40).toUpperCase();
    if (!/^[A-Z][A-Z0-9]*-[0-9]+$/.test(identifier)) return invalid("identifier must look like OGE-32");
    const result = await linearQuery(env, "query Issue($identifier: String!) { issue(id: $identifier) { identifier title description url updatedAt priority state { name } assignee { name } labels { nodes { name } } } }", { identifier });
    return result.ok ? envelope(name, result.data) : result.error;
  }
  if (name === "lss_recent_turns") {
    const limit = Number(input.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 30) return invalid("limit must be an integer from 1 to 30");
    if (!env.DB) return { ok: false, code: "CONFIGURATION_REQUIRED", verified: false, read_only: true, missing: "D1 binding DB" };
    const rows = await env.DB.prepare("SELECT role, content, model, created_at, sequence_no, source_surface FROM chat_messages WHERE conversation_id = ? ORDER BY sequence_no DESC, created_at DESC LIMIT ?").bind(CANONICAL_CONVERSATION, limit).all<Record<string, unknown>>();
    return envelope(name, { conversation: CANONICAL_CONVERSATION, session: CANONICAL_SESSION, turns: (rows.results ?? []).reverse() });
  }
  if (name === "yellowstone_status") {
    if (!env.DB) return { ok: false, code: "CONFIGURATION_REQUIRED", verified: false, read_only: true, missing: "D1 binding DB" };
    const context = await readCanonicalD1Context(env.DB as ConnectorD1 | undefined, { git_sha: env.OGENIC_GIT_SHA, git_branch: CANONICAL_BRANCH, build_uuid: env.OGENIC_BUILD_UUID, runtime: env.OGENIC_RUNTIME, phase: env.OGENIC_PHASE, version: env.CF_VERSION_METADATA });
    return envelope(name, { runtime: "YELLOW_STONE_CAPABILITY_RESOLVER_V1", state: context.state, counts: context.counts, policy: "READ_ONLY_NO_PROVIDER_SIDE_EFFECTS", canonical_branch: CANONICAL_BRANCH });
  }
  const connectors = await readConnectorRegistry(env);
  return envelope(name, { runtime: clip(env.OGENIC_RUNTIME, 80) || "cloudflare", phase: clip(env.OGENIC_PHASE, 40) || "VI", git_sha: clip(env.OGENIC_GIT_SHA, 80) || null, branch: CANONICAL_BRANCH, build_uuid: clip(env.OGENIC_BUILD_UUID, 120) || null, connectors });
}
