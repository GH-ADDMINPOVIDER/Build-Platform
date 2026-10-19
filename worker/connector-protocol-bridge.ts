// OGE-132. Adapts the lnwjud tool-catalog/permission separation to the existing WAVE Worker.
// Reference: https://github.com/engasnm111/lnwjud (MIT, Copyright 2026 Adisorn).
// There is NO second MCP server or execution authority here.
import { connectorModes, connectorAliases } from "./connector-endpoint-api";

export const protocolActions: Record<string, readonly string[]> = {
  mcp: ["inspect", "discover", "invoke_read"],
  n8n: ["inspect", "probe"],
  api: ["inspect", "resolve", "plan", "confirm"],
  token: ["inspect", "reference"],
  secret: ["inspect", "reference"],
  credential: ["inspect", "reference"],
  pr_api: ["inspect", "invoke_read", "plan", "confirm"],
  agent_api: ["inspect", "plan", "confirm"],
  function_calling: ["inspect", "invoke_read", "plan", "confirm"],
  npx: ["inspect", "plan", "confirm"],
  npm: ["inspect", "plan", "confirm"],
  sdk: ["inspect", "plan", "confirm"],
  a2a: ["inspect", "plan", "confirm"],
  webhook: ["inspect"],
  agent_sign_run: ["inspect", "plan", "confirm"],
};

export const protocolCatalog = connectorModes.map((mode) => ({
  transport: mode.id,
  adapter: mode.via,
  readiness: mode.ready,
  operations: protocolActions[mode.id],
  can_run_without_owner_sign: ["inspect", "discover", "probe", "reference", "resolve", "invoke_read"],
  execution_authority: "YELLOW_STONE_ONLY",
  source_contract_only: ["npx", "npm", "sdk", "a2a"].includes(mode.id),
}));

export type ProtocolInvocation = {
  transport: keyof typeof protocolActions;
  operation: string;
  provider: string;
  name: string;
  arguments: Record<string, unknown>;
  command: string;
  approval?: { confirmed: boolean; approval_id: string };
};

type Invalid = { ok: false; code: string };
type Valid = { ok: true; value: ProtocolInvocation };
const IDENT = /^[a-z][a-z0-9_-]{0,79}$/;
const TOOL = /^[a-zA-Z][a-zA-Z0-9_.:-]{0,119}$/;
const ALLOWED_KEYS = new Set(["transport", "operation", "provider", "name", "arguments", "command", "approval", "environment"]);
const SENSITIVE = /(authorization|password|passwd|secret|token|cookie|private.?key|api.?key|credential)/i;
const rawText = (x: unknown) => typeof x === "string" ? x.trim() : "";

function containsCredentialKey(value: unknown, depth = 0): boolean {
  if (depth > 4) return true;
  if (Array.isArray(value)) return value.length > 100 || value.some((part) => containsCredentialKey(part, depth + 1));
  if (!value || typeof value !== "object") return false;
  const entries = Object.entries(value);
  return entries.length > 32 || entries.some(([key, v]) => SENSITIVE.test(key) || containsCredentialKey(v, depth + 1));
}

export function normalizeProtocolInvocation(raw: unknown): Valid | Invalid {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, code: "INVALID_PROTOCOL_ENVELOPE" };
  const b = raw as Record<string, unknown>;
  if (Object.keys(b).some((key) => !ALLOWED_KEYS.has(key))) return { ok: false, code: "UNSUPPORTED_FIELD" };
  if (b.environment !== undefined && b.environment !== "staging") return { ok: false, code: "ENVIRONMENT_SCOPE_MISMATCH" };
  const transportInput = rawText(b.transport).toLowerCase();
  const transport = (connectorAliases[transportInput] || transportInput) as keyof typeof protocolActions;
  if (!Object.prototype.hasOwnProperty.call(protocolActions, transport)) return { ok: false, code: "TRANSPORT_UNKNOWN" };
  const operation = rawText(b.operation).toLowerCase();
  if (!protocolActions[transport].includes(operation)) return { ok: false, code: "PROTOCOL_OPERATION_UNSUPPORTED" };
  const provider = rawText(b.provider).toLowerCase();
  const name = rawText(b.name);
  const command = rawText(b.command);
  if ((provider && !IDENT.test(provider)) || (name && !TOOL.test(name))) return { ok: false, code: "INVALID_IDENTIFIER" };
  if (command.length > 1000 || (command && SENSITIVE.test(command))) return { ok: false, code: "UNSAFE_COMMAND" };
  if (b.arguments !== undefined && (!b.arguments || typeof b.arguments !== "object" || Array.isArray(b.arguments))) {
    return { ok: false, code: "INVALID_ARGUMENTS" };
  }
  const args = (b.arguments ?? {}) as Record<string, unknown>;
  if (JSON.stringify(args).length > 6000 || containsCredentialKey(args)) return { ok: false, code: "UNSAFE_ARGUMENTS" };
  if (b.approval !== undefined && (!b.approval || typeof b.approval !== "object" || Array.isArray(b.approval))) {
    return { ok: false, code: "INVALID_APPROVAL" };
  }
  const approval = b.approval as Record<string, unknown> | undefined;
  if (approval && (Object.keys(approval).some((k) => !["confirmed", "approval_id"].includes(k)) ||
      approval.confirmed !== true || typeof approval.approval_id !== "string" ||
      !/^wave-approval-[a-f0-9]{64}$/.test(approval.approval_id))) return { ok: false, code: "INVALID_APPROVAL" };
  if (operation === "confirm" && !approval) return { ok: false, code: "APPROVAL_REQUIRED" };
  if (operation !== "confirm" && approval) return { ok: false, code: "UNEXPECTED_APPROVAL" };
  if (["plan", "confirm"].includes(operation) && !command) return { ok: false, code: "COMMAND_REQUIRED" };
  if (["reference", "resolve", "discover", "probe"].includes(operation) && !provider && operation !== "probe") return { ok: false, code: "PROVIDER_REQUIRED" };
  if (operation === "invoke_read" && !name) return { ok: false, code: "TOOL_REQUIRED" };
  return { ok: true, value: {
    transport, operation, provider, name, arguments: args, command,
    ...(approval ? { approval: { confirmed: true, approval_id: approval.approval_id as string } } : {}),
  } };
}
