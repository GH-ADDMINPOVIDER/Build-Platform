import { createHash } from "node:crypto";

const definitions = [
  { name: "help", command: "/solo.help", aliases: ["/wf.help"], description: "List Solo commands, required capabilities, and execution boundaries.", capability: "00.core_router", risk: "read_only", adapter: "none" },
  { name: "status", command: "/solo.status", aliases: ["/wf.sync.status"], description: "Read current system, connector, and execution status.", capability: "10.observability_control", risk: "read_only", adapter: "none" },
  { name: "inspect", command: "/solo.inspect", aliases: [], description: "Inspect a named repository, service, workflow, or resource without changing it.", capability: "10.observability_control", risk: "read_only", adapter: "connected_read_adapter" },
  { name: "route", command: "/solo.route", aliases: [], description: "Classify a natural-language request and prepare its minimum capability route.", capability: "00.core_router", risk: "read_only", adapter: "none" },
  { name: "run", command: "/solo.run", aliases: [], description: "Request execution through the approved adapter contract; this resolver never dispatches.", capability: "00.core_router", risk: "classified_per_request", adapter: "cc_adapter_contract" },
  { name: "verify", command: "/solo.verify", aliases: [], description: "Read back execution results and verify evidence independently.", capability: "10.observability_control", risk: "read_only", adapter: "connected_read_adapter" },
  { name: "audit", command: "/solo.audit.latest", aliases: ["/wf.audit.latest"], description: "Retrieve the latest source, workflow, build, and deployment audit.", capability: "10.observability_control", risk: "read_only", adapter: "connected_read_adapter" },
  { name: "history", command: "/solo.history", aliases: [], description: "Retrieve prior command receipts and execution history.", capability: "10.observability_control", risk: "read_only", adapter: "connected_read_adapter" },
  { name: "handoff", command: "/solo.handoff", aliases: [], description: "Prepare a durable, evidence-complete handoff for an authorized execution agent.", capability: "01.code_build", risk: "write_requires_review", adapter: "cc_adapter_contract" },
  { name: "rollback-plan", command: "/solo.rollback.plan", aliases: ["/wf.rollback.plan"], description: "Prepare a reversible rollback plan; does not execute rollback.", capability: "03.automation_delivery", risk: "read_only", adapter: "none" },
];

export const SOLO_COMMANDS = Object.freeze(definitions.map((item) => Object.freeze({
  ...item,
  aliases: Object.freeze([...item.aliases]),
})));

const byToken = new Map();
for (const item of SOLO_COMMANDS) {
  byToken.set(item.command, item);
  for (const alias of item.aliases) byToken.set(alias, item);
}

const digest = (value) => createHash("sha256").update(value).digest("hex");

export function listSoloCommands() {
  return SOLO_COMMANDS.map(({ aliases, ...item }) => ({ ...item, aliases: [...aliases] }));
}

export function normalizeCommandInput(input) {
  const source = String(input ?? "").trim();
  if (!source) return { raw: "", normalized: "", token: "", args: "" };
  const normalized = source.replace(/\\s+/g, " ").trim();
  const match = normalized.match(/^(\/[^\s]+)(?:\s+([\s\S]*))?$/);
  return {
    raw: source,
    normalized,
    token: match ? match[1].toLowerCase() : "",
    args: match?.[2] ?? "",
  };
}

/**
 * Resolve only. This function deliberately has no adapter invocation, persistence,
 * signature, credential, or network side effect.
 */
export function resolveSoloCommand(input, route) {
  const parsed = normalizeCommandInput(input);
  const definition = parsed.token ? byToken.get(parsed.token) : byToken.get("/solo.route");
  const recognized = Boolean(definition);
  const canonical = definition?.command ?? null;
  const intent = parsed.token ? parsed.args : parsed.normalized;
  const commandDigest = digest([canonical ?? "unknown", intent].join("\n"));
  const requiresAdapter = Boolean(definition && definition.adapter !== "none");

  return {
    recognized,
    input: parsed.raw,
    normalized: parsed.normalized,
    command: canonical,
    name: definition?.name ?? "unknown",
    args: intent,
    description: definition?.description ?? "Command is not registered. Use /solo.help to list supported commands.",
    capability: definition?.capability ?? "00.core_router",
    risk: definition?.risk ?? "unclassified",
    adapter: definition?.adapter ?? "none",
    executionState: recognized ? (requiresAdapter ? "WAITING_ADAPTER_CONTRACT" : "PLANNED_ONLY") : "UNRECOGNIZED",
    dispatched: false,
    approval: route?.approval ?? "auto",
    route: route ?? null,
    correlationId: `cmd_${commandDigest.slice(0, 20)}`,
    idempotencyKey: `idem_${commandDigest}`,
    evidenceRequired: ["execution_receipt", "independent_readback", "source_provenance"],
  };
}
