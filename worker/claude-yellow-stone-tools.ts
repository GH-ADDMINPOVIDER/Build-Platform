import { verifyMcpAccessToken, type WaveMcpOAuthBindings } from "./wave-mcp-oauth";

export type YellowDispatch = (request: Request) => Promise<Response>;
type Tool = { name: string; title: string; description: string; inputSchema: Record<string, unknown>; annotations: Record<string, boolean>; securitySchemes: { type: string; scopes: string[] }[] };

const commandSchema = {
  type: "object", additionalProperties: false, required: ["intent", "capability", "provider"],
  properties: {
    intent: { type: "string", minLength: 1, maxLength: 1200 },
    capability: { type: "string", maxLength: 160 }, provider: { type: "string", maxLength: 120 },
    environment: { type: "string", enum: ["staging"], default: "staging" },
    mode: { type: "string", enum: ["autonomous", "read", "write", "execute", "team"] },
    input: { type: "object", additionalProperties: false, properties: {
      path: { type: "string", maxLength: 500 }, prompt: { type: "string", maxLength: 12000 },
    } },
  },
};
const tool = (name: string, title: string, description: string, inputSchema: Record<string, unknown>, scopes: string[], readOnly: boolean): Tool => ({
  name, title, description, inputSchema,
  annotations: { readOnlyHint: readOnly, destructiveHint: !readOnly, openWorldHint: true },
  securitySchemes: [{ type: "oauth2", scopes }],
});
export const YELLOW_STONE_TOOLS: Tool[] = [
  tool("yellow_stone_resolve", "Yellow Stone capability resolver", "Resolve an intent against existing providers and capability policy before execution. This does not execute the task.", commandSchema, ["ogenic:read"], true),
  tool("yellow_stone_execute", "Yellow Stone execute capability", "Invoke the existing capability execution adapter with Owner authorization. Read, write and execution outcomes depend on the registered adapter and existing policy. Unsupported operations return an explicit configuration error; never claim a queued task is complete.", commandSchema, ["ogenic:read", "ogenic:write", "ogenic:execute"], false),
  tool("unifiend_command", "Unifiend / Athena command", "Submit a staging task through existing Athena and Yellow Stone policy. Use capability codex_selfhost, provider openai for the existing host/Codex execution lane. Includes existing queue, approval, idempotency and evidence semantics; no new runner or direct shell bypass.", { ...commandSchema, properties: { ...commandSchema.properties, idempotency_key: { type: "string", pattern: "^[0-9a-fA-F-]{36}$" } } }, ["ogenic:read", "ogenic:write", "ogenic:execute"], false),
  tool("unifiend_command_status", "Unifiend task result", "Read the existing task state and native execution evidence. QUEUED and DISPATCHED are not DONE.", { type: "object", additionalProperties: false, required: ["task_id"], properties: { task_id: { type: "string", pattern: "^wavecmd_[a-f0-9]{64}$" } } }, ["ogenic:read"], true),
  tool("yellow_stone_mcp_bindings", "Yellow Stone MCP providers", "Read existing configured MCP providers and credential-reference presence without returning credentials.", { type: "object", additionalProperties: false, properties: {} }, ["ogenic:read"], true),
  tool("yellow_stone_mcp_discover", "Yellow Stone provider tool discovery", "Initialize and list tools on one existing configured MCP provider. This reports actual discovery state, not execution success.", { type: "object", additionalProperties: false, required: ["provider"], properties: { provider: { type: "string", pattern: "^[a-z0-9][a-z0-9_-]{0,79}$" } } }, ["ogenic:read"], true),
];

function b64(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

// OAuth owner consent authenticates this internal call. The 30-second session
// stays inside this Worker and is never sent to Claude or any provider.
async function internalOwnerToken(secret: string) {
  const encoder = new TextEncoder();
  const payload = b64(encoder.encode(JSON.stringify({ sub: "ogenic-owner", role: "owner", exp: Math.floor(Date.now() / 1000) + 30, nonce: crypto.randomUUID() })));
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return `${payload}.${b64(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(payload))))}`;
}

export async function callYellowStoneTool(name: string, args: Record<string, unknown>, source: Request, env: WaveMcpOAuthBindings, dispatch?: YellowDispatch) {
  const spec = YELLOW_STONE_TOOLS.find((item) => item.name === name);
  if (!spec) return null;
  const auth = await verifyMcpAccessToken(source, env);
  if (!auth.ok) return { ok: false, code: "OAUTH_AUTHORIZATION_REQUIRED", execution_started: false };
  if (!spec.securitySchemes[0].scopes.every((scope) => auth.scopes.includes(scope))) {
    return { ok: false, code: "INSUFFICIENT_SCOPE", required_scopes: spec.securitySchemes[0].scopes, execution_started: false };
  }
  if (!dispatch || !env.OGENIC_OPS_KEY) return { ok: false, code: "YELLOW_STONE_ADAPTER_UNAVAILABLE", execution_started: false };
  if (args.environment != null && args.environment !== "staging") return { ok: false, code: "ENVIRONMENT_SCOPE_MISMATCH", execution_started: false };
  const routes: Record<string, string> = {
    yellow_stone_resolve: "/api/capabilities/resolve", yellow_stone_execute: "/api/capabilities/execute",
    unifiend_command: "/api/unifiend/command", unifiend_command_status: "/api/unifiend/command/status",
    yellow_stone_mcp_bindings: "/api/mcp-config/state", yellow_stone_mcp_discover: "/api/mcp-config/discover",
  };
  const target = new URL(routes[name], "https://wave.ogenicchocolate.com");
  const read = ["unifiend_command_status", "yellow_stone_mcp_bindings", "yellow_stone_mcp_discover"].includes(name);
  if (name === "unifiend_command_status") {
    if (typeof args.task_id !== "string" || !/^wavecmd_[a-f0-9]{64}$/.test(args.task_id)) return { ok: false, code: "INVALID_TASK_ID" };
    target.searchParams.set("task_id", args.task_id);
  }
  if (name === "yellow_stone_mcp_discover") {
    if (typeof args.provider !== "string" || !/^[a-z0-9][a-z0-9_-]{0,79}$/.test(args.provider)) return { ok: false, code: "INVALID_PROVIDER" };
    target.searchParams.set("provider", args.provider);
  }
  if (!read && (typeof args.intent !== "string" || !args.intent.trim() || args.intent.length > 1200)) return { ok: false, code: "INVALID_INTENT" };
  const idempotency = args.idempotency_key;
  if (idempotency != null && (typeof idempotency !== "string" || !/^[0-9a-f-]{36}$/i.test(idempotency))) return { ok: false, code: "INVALID_IDEMPOTENCY_KEY" };
  const headers = new Headers({ "Content-Type": "application/json", Authorization: `Bearer ${await internalOwnerToken(env.OGENIC_OPS_KEY.trim())}`, "X-OGENIC-Client": "native", "X-OGENIC-Command-Origin": "claude-mcp-yellow-stone" });
  if (name === "unifiend_command") headers.set("Idempotency-Key", typeof idempotency === "string" ? idempotency : crypto.randomUUID());
  const input = args.input && typeof args.input === "object" && !Array.isArray(args.input) ? args.input as Record<string, unknown> : {};
  const body = { intent: args.intent, capability: args.capability, provider: args.provider, environment: "staging", mode: args.mode ?? (name === "unifiend_command" ? "autonomous" : "read"), input: { path: input.path, prompt: input.prompt } };
  const response = await dispatch(new Request(target, { method: read ? "GET" : "POST", headers, body: read ? undefined : JSON.stringify(body) }));
  if (!(response.headers.get("content-type") ?? "").includes("application/json")) return { ok: false, code: "YELLOW_STONE_RESPONSE_INVALID", http_status: response.status };
  const result = await response.json();
  return { http_status: response.status, execution_authority: "YELLOW_STONE_ONLY", result };
}
