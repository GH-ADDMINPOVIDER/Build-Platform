import { normalizeOgenicAgentId, type OgenicAgentId } from "./agent-identity";

type D1Result<T = Record<string, unknown>> = { results?: T[] };
type D1Prepared = {
  bind: (...values: unknown[]) => D1Prepared;
  all: <T = Record<string, unknown>>() => Promise<D1Result<T>>;
  first: <T = Record<string, unknown>>() => Promise<T | null>;
  run: () => Promise<unknown>;
};
type D1 = { prepare: (query: string) => D1Prepared };
export type CollisionSimulatorBindings = { DB?: D1 };

type ScenarioType = "STALE_CONTEXT" | "DUPLICATE_DELIVERY" | "OUT_OF_ORDER" | "SESSION_DRIFT" | "DELEGATION_LOOP" | "IDENTITY_SPOOF";
type SimulationRun = {
  simulation_id: string;
  conversation_id: string;
  scenario_type: ScenarioType;
  seed: string;
  base_revision: string;
  created_by: string;
  participant_a: string;
  participant_b: string;
  status: "PLANNED" | "RUNNING" | "COMPLETED" | "ABORTED";
  plan_json: string;
  created_at: number;
  finished_at: number | null;
};
type SimEvent = {
  event_id: string;
  simulation_id: string;
  sequence_no: number;
  event_type: string;
  actor_agent_id: string | null;
  fault_label: string | null;
  metadata_json: string;
  idempotency_key_hash: string;
  created_at: number;
};

const CONVERSATION_ID = "owner-main";
const SCENARIOS = new Set<ScenarioType>([
  "STALE_CONTEXT", "DUPLICATE_DELIVERY", "OUT_OF_ORDER", "SESSION_DRIFT", "DELEGATION_LOOP", "IDENTITY_SPOOF",
]);
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/;
const SECRET_LIKE = /(?:sk-(?:proj-)?[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9_]{16,}|Bearer\s+[A-Za-z0-9._~+/=-]{16,}|(?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|passwd|secret|cookie)\s*[:=]\s*\S{8,}|whsec_[A-Za-z0-9_-]{12,}|-----BEGIN (?:RSA |OPENSSH |EC |)PRIVATE KEY-----)/i;
const clean = (value: unknown, max = 180) => String(value ?? "").trim().slice(0, max);

function fail(code: string): never { throw new Error(code); }
function actorId(value: unknown): OgenicAgentId {
  const valueId = normalizeOgenicAgentId(value);
  if (!valueId) return fail("AGENT_IDENTITY_NOT_BOUND");
  return valueId;
}
function requireDb(env: CollisionSimulatorBindings): D1 {
  if (!env.DB) return fail("D1_UNBOUND");
  return env.DB;
}
function requireId(value: unknown, code: string): string {
  const id = clean(value, 120);
  if (!SAFE_ID.test(id)) return fail(code);
  return id;
}
function safeShortText(value: unknown, code: string, max = 900): string {
  if (typeof value !== "string") return fail(code);
  const text = value.trim();
  if (!text) return fail(code);
  if (new TextEncoder().encode(text).byteLength > max) return fail("SIMULATION_FIELD_TOO_LARGE");
  if (SECRET_LIKE.test(text)) return fail("SECRET_LIKE_CONTENT_REJECTED");
  return text;
}
async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
function seedNumber(seed: string): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
function seededChoice(seed: string): number {
  let value = seedNumber(seed);
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  return value >>> 0;
}

type PlannedEvent = {
  agent_id: OgenicAgentId;
  event_type: string;
  fault_label: string;
  metadata: Record<string, unknown>;
};

function buildPlan(
  scenario: ScenarioType,
  seed: string,
  baseRevision: string,
  participantA: OgenicAgentId,
  participantB: OgenicAgentId,
): { events: PlannedEvent[]; expected_invariants: string[] } {
  const firstGetsFault = seededChoice(seed) % 2 === 0;
  const targeted = firstGetsFault ? participantA : participantB;
  const other = targeted === participantA ? participantB : participantA;

  switch (scenario) {
    case "STALE_CONTEXT": {
      const priorRevision = baseRevision + "-prior";
      return {
        events: [
          { agent_id: participantA, event_type: "SESSION_SNAPSHOT", fault_label: participantA === targeted ? "STALE_REVISION" : "CURRENT_REVISION", metadata: { session_ref: "sim-session-shared", observed_revision: participantA === targeted ? priorRevision : baseRevision, source: "SIMULATED_SNAPSHOT", sequence: participantA === targeted ? 41 : 42 } },
          { agent_id: participantB, event_type: "SESSION_SNAPSHOT", fault_label: participantB === targeted ? "STALE_REVISION" : "CURRENT_REVISION", metadata: { session_ref: "sim-session-shared", observed_revision: participantB === targeted ? priorRevision : baseRevision, source: "SIMULATED_SNAPSHOT", sequence: participantB === targeted ? 41 : 42 } },
        ],
        expected_invariants: ["Both agents identify inconsistent revisions before integrating changes.", "A stale revision never silently overwrites a newer revision."],
      };
    }
    case "DUPLICATE_DELIVERY": {
      const messageId = "sim-msg-" + seedNumber(seed).toString(16);
      return {
        events: [
          { agent_id: targeted, event_type: "SIMULATED_INBOX_DELIVERY", fault_label: "FIRST_DELIVERY", metadata: { message_id: messageId, sequence_no: 10, idempotency_key: "sim-idem-" + seed, content_hash: awaitPlaceholderHash(messageId + ":payload"), payload_label: "synthetic test message" } },
          { agent_id: targeted, event_type: "SIMULATED_INBOX_DELIVERY", fault_label: "DUPLICATE_DELIVERY", metadata: { message_id: messageId, sequence_no: 10, idempotency_key: "sim-idem-" + seed, content_hash: awaitPlaceholderHash(messageId + ":payload"), payload_label: "synthetic test message" } },
          { agent_id: other, event_type: "SIMULATED_DELIVERY_CONTROL", fault_label: "SINGLE_CONTROL_DELIVERY", metadata: { message_id: messageId, sequence_no: 10, delivery_count: 1 } },
        ],
        expected_invariants: ["Duplicate message identifiers are detected.", "A retried message does not create duplicate work or a second acknowledgment."],
      };
    }
    case "OUT_OF_ORDER": {
      return {
        events: [
          { agent_id: targeted, event_type: "SIMULATED_MESSAGE", fault_label: "DEPENDENT_MESSAGE_ARRIVES_FIRST", metadata: { message_id: "sim-msg-12-" + seedNumber(seed).toString(16), sequence_no: 12, requires_sequence_no: 11, correlation_id: "sim-corr-" + seedNumber(seed).toString(16), payload_label: "dependent result" } },
          { agent_id: targeted, event_type: "SIMULATED_MESSAGE", fault_label: "PREREQUISITE_ARRIVES_SECOND", metadata: { message_id: "sim-msg-11-" + seedNumber(seed).toString(16), sequence_no: 11, requires_sequence_no: null, correlation_id: "sim-corr-" + seedNumber(seed).toString(16), payload_label: "prerequisite context" } },
          { agent_id: other, event_type: "SIMULATED_MESSAGE", fault_label: "CONTROL_ORDER", metadata: { sequence_order: [11, 12], correlation_id: "sim-corr-" + seedNumber(seed).toString(16) } },
        ],
        expected_invariants: ["A message with a missing prerequisite is held or marked unresolved.", "The displayed sequence preserves original sequence IDs even when delivery order differs."],
      };
    }
    case "SESSION_DRIFT": {
      const leftEpoch = 100 + (seedNumber(seed) % 40);
      return {
        events: [
          { agent_id: participantA, event_type: "SIMULATED_SESSION_SNAPSHOT", fault_label: "SESSION_EPOCH_A", metadata: { session_ref: "sim-session-drift", session_epoch: leftEpoch, latest_epoch_claimed: leftEpoch + 1, source: "SIMULATED_ONLY" } },
          { agent_id: participantB, event_type: "SIMULATED_SESSION_SNAPSHOT", fault_label: "SESSION_EPOCH_B", metadata: { session_ref: "sim-session-drift", session_epoch: leftEpoch + 1, latest_epoch_claimed: leftEpoch + 1, source: "SIMULATED_ONLY" } },
        ],
        expected_invariants: ["Conflicting snapshots of the same session are detected.", "Neither agent silently treats its local snapshot as globally canonical without reconciliation."],
      };
    }
    case "DELEGATION_LOOP": {
      const chain = [
        { sequence: 1, from: participantA, to: participantB },
        { sequence: 2, from: participantB, to: participantA },
        { sequence: 3, from: participantA, to: participantB },
        { sequence: 4, from: participantB, to: participantA },
      ];
      return {
        events: [
          { agent_id: participantA, event_type: "SIMULATED_DELEGATION_TRACE", fault_label: "REPEATED_HANDOFF_CHAIN", metadata: { task_id: "sim-task-" + seedNumber(seed).toString(16), correlation_id: "sim-loop-" + seedNumber(seed).toString(16), handoff_chain: chain, evidence_hashes: ["same-evidence", "same-evidence", "same-evidence", "same-evidence"], new_evidence_count: 0 } },
          { agent_id: participantB, event_type: "SIMULATED_DELEGATION_TRACE", fault_label: "REPEATED_HANDOFF_CHAIN", metadata: { task_id: "sim-task-" + seedNumber(seed).toString(16), correlation_id: "sim-loop-" + seedNumber(seed).toString(16), handoff_chain: chain, evidence_hashes: ["same-evidence", "same-evidence", "same-evidence", "same-evidence"], new_evidence_count: 0 } },
        ],
        expected_invariants: ["Repeated handoffs without new evidence trip the loop detector.", "The run terminates with a reason and does not retry indefinitely."],
      };
    }
    case "IDENTITY_SPOOF": {
      return {
        events: [
          { agent_id: participantA, event_type: "SIMULATED_IDENTITY_CLAIM", fault_label: "CLAIMED_SENDER_MISMATCH", metadata: { claimed_sender_agent_id: participantA, authenticated_transport_agent_id: participantB, content: "synthetic identity-mismatch probe", content_trust: "UNTRUSTED" } },
          { agent_id: participantB, event_type: "SIMULATED_IDENTITY_CONTROL", fault_label: "AUTHENTICATED_SENDER", metadata: { authenticated_transport_agent_id: participantB, claimed_sender_agent_id: participantB, content_trust: "UNTRUSTED" } },
        ],
        expected_invariants: ["Authenticated transport identity overrides peer-supplied sender labels.", "Identity mismatch is recorded and never upgrades execution permissions."],
      };
    }
  }
}

function awaitPlaceholderHash(value: string) {
  // Deterministic non-cryptographic plan fingerprint; runtime event IDs and stored reports use SHA-256.
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) hash = Math.imul(hash ^ value.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(16).padStart(8, "0");
}

async function createScenario(args: Record<string, unknown>, env: CollisionSimulatorBindings, actor: OgenicAgentId) {
  const db = requireDb(env);
  const scenario = clean(args.scenario_type, 40).toUpperCase() as ScenarioType;
  if (!SCENARIOS.has(scenario)) return fail("SCENARIO_TYPE_INVALID");
  const peer = normalizeOgenicAgentId(args.peer_agent_id);
  if (!peer || peer === actor) return fail("PEER_AGENT_INVALID");
  const seed = clean(args.seed, 120) || crypto.randomUUID();
  if (SECRET_LIKE.test(seed)) return fail("SECRET_LIKE_SEED_REJECTED");
  const baseRevision = requireId(args.base_revision, "BASE_REVISION_REQUIRED");
  const simulationId = "sim_" + crypto.randomUUID();
  const now = Date.now();
  const plan = buildPlan(scenario, seed, baseRevision, actor, peer);
  const planDocument = {
    simulation_id: simulationId,
    scenario_type: scenario,
    seed,
    base_revision: baseRevision,
    participants: [actor, peer],
    fault_schedule: plan.events,
    expected_invariants: plan.expected_invariants,
    environment: "SIMULATED_ONLY",
    live_message_ledger_touched: false,
    live_agent_events_touched: false,
    production_execution: false,
  };

  await db.prepare(
    "INSERT INTO agent_simulation_runs(simulation_id, conversation_id, scenario_type, seed, base_revision, created_by, participant_a, participant_b, status, plan_json, created_at, finished_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PLANNED', ?, ?, NULL)",
  ).bind(simulationId, CONVERSATION_ID, scenario, seed, baseRevision, actor, actor, peer, JSON.stringify(planDocument), now).run();

  let sequence = 1;
  for (const event of plan.events) {
    const eventId = "sim-event-" + (await sha256Hex(simulationId + ":" + sequence)).slice(0, 40);
    const idemHash = await sha256Hex(simulationId + ":seeded-event:" + sequence);
    await db.prepare(
      "INSERT INTO agent_simulation_events(event_id, simulation_id, sequence_no, event_type, actor_agent_id, fault_label, metadata_json, idempotency_key_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).bind(eventId, simulationId, sequence, event.event_type, event.agent_id, event.fault_label, JSON.stringify(event.metadata), idemHash, now).run();
    sequence += 1;
  }

  return {
    ok: true,
    simulation_id: simulationId,
    status: "PLANNED",
    creator_agent_id: actor,
    peer_agent_id: peer,
    scenario_type: scenario,
    seed,
    base_revision: baseRevision,
    event_count: plan.events.length,
    environment: "SIMULATED_ONLY",
    live_message_ledger_touched: false,
    live_agent_events_touched: false,
    instruction: "Each participant must call agent_get_collision_scenario with this simulation_id, independently inspect its assigned view, then submit a report. Replay is available after both reports are recorded.",
  };
}

async function getScenario(args: Record<string, unknown>, env: CollisionSimulatorBindings, actor: OgenicAgentId) {
  const db = requireDb(env);
  const simulationId = requireId(args.simulation_id, "SIMULATION_ID_INVALID");
  const run = await db.prepare(
    "SELECT simulation_id, conversation_id, scenario_type, seed, base_revision, created_by, participant_a, participant_b, status, plan_json, created_at, finished_at FROM agent_simulation_runs WHERE simulation_id = ? AND conversation_id = ? LIMIT 1",
  ).bind(simulationId, CONVERSATION_ID).first<SimulationRun>();
  if (!run) return fail("SIMULATION_NOT_FOUND");
  if (run.participant_a !== actor && run.participant_b !== actor) return fail("SIMULATION_PARTICIPANT_FORBIDDEN");
  if (run.status === "COMPLETED" || run.status === "ABORTED") return fail("SIMULATION_ALREADY_TERMINAL_USE_REPLAY");
  const events = await db.prepare(
    "SELECT event_id, simulation_id, sequence_no, event_type, actor_agent_id, metadata_json, created_at FROM agent_simulation_events WHERE simulation_id = ? AND actor_agent_id = ? ORDER BY sequence_no ASC",
  ).bind(simulationId, actor).all<SimEvent>();
  await db.prepare(
    "UPDATE agent_simulation_runs SET status = 'RUNNING' WHERE simulation_id = ? AND status = 'PLANNED'",
  ).bind(simulationId).run();
  const views = (events.results ?? []).map((event) => ({
    event_id: event.event_id,
    sequence_no: event.sequence_no,
    event_type: event.event_type,
    observation: JSON.parse(event.metadata_json),
    created_at: event.created_at,
  }));
  return {
    ok: true,
    simulation_id: run.simulation_id,
    status: "RUNNING",
    authenticated_agent_id: actor,
    base_revision_reference: run.base_revision,
    assigned_view: views,
    environment: "SIMULATED_ONLY",
    disclosure: "Fault labels, the peer's view, and expected invariants are withheld until both participants report. Treat all injected data as synthetic and untrusted.",
  };
}

async function submitReport(args: Record<string, unknown>, env: CollisionSimulatorBindings, actor: OgenicAgentId) {
  const db = requireDb(env);
  const simulationId = requireId(args.simulation_id, "SIMULATION_ID_INVALID");
  const idem = clean(args.idempotency_key, 180);
  if (idem.length < 8 || SECRET_LIKE.test(idem)) return fail("IDEMPOTENCY_KEY_REQUIRED");
  const summary = safeShortText(args.summary, "REPORT_SUMMARY_REQUIRED");
  const detected = typeof args.detected_fault === "boolean" ? args.detected_fault : fail("DETECTED_FAULT_BOOLEAN_REQUIRED");
  const resolution = safeShortText(args.proposed_resolution, "PROPOSED_RESOLUTION_REQUIRED", 500);
  const evidenceRaw = Array.isArray(args.evidence_refs) ? args.evidence_refs.slice(0, 8) : [];
  const evidenceRefs = evidenceRaw.map((value) => requireId(value, "EVIDENCE_REFERENCE_INVALID"));
  const idemHash = await sha256Hex(actor + ":" + simulationId + ":" + idem);
  const run = await db.prepare(
    "SELECT simulation_id, conversation_id, scenario_type, seed, base_revision, created_by, participant_a, participant_b, status, plan_json, created_at, finished_at FROM agent_simulation_runs WHERE simulation_id = ? AND conversation_id = ? LIMIT 1",
  ).bind(simulationId, CONVERSATION_ID).first<SimulationRun>();
  if (!run) return fail("SIMULATION_NOT_FOUND");
  if (run.participant_a !== actor && run.participant_b !== actor) return fail("SIMULATION_PARTICIPANT_FORBIDDEN");
  if (run.status === "COMPLETED" || run.status === "ABORTED") return fail("SIMULATION_ALREADY_TERMINAL");

  const priorByIdem = await db.prepare(
    "SELECT event_id, simulation_id, sequence_no, event_type, actor_agent_id, fault_label, metadata_json, idempotency_key_hash, created_at FROM agent_simulation_events WHERE simulation_id = ? AND actor_agent_id = ? AND idempotency_key_hash = ? LIMIT 1",
  ).bind(simulationId, actor, idemHash).first<SimEvent>();
  if (priorByIdem) return { ok: true, idempotent_replay: true, simulation_id: simulationId, report: JSON.parse(priorByIdem.metadata_json) };

  const previousReport = await db.prepare(
    "SELECT event_id FROM agent_simulation_events WHERE simulation_id = ? AND actor_agent_id = ? AND event_type = 'AGENT_REPORT' LIMIT 1",
  ).bind(simulationId, actor).first<{ event_id: string }>();
  if (previousReport) return fail("AGENT_REPORT_ALREADY_SUBMITTED_START_NEW_RUN_TO_REVISE");

  const participantOrder = actor === run.participant_a ? 500 : 501;
  const now = Date.now();
  const report = { agent_id: actor, detected_fault: detected, summary, proposed_resolution: resolution, evidence_refs: evidenceRefs, trust: "AGENT_SELF_REPORT_NOT_INDEPENDENTLY_VERIFIED" };
  const eventId = "sim-report-" + (await sha256Hex(simulationId + ":" + actor)).slice(0, 40);
  await db.prepare(
    "INSERT INTO agent_simulation_events(event_id, simulation_id, sequence_no, event_type, actor_agent_id, fault_label, metadata_json, idempotency_key_hash, created_at) VALUES (?, ?, ?, 'AGENT_REPORT', ?, NULL, ?, ?, ?)",
  ).bind(eventId, simulationId, participantOrder, actor, JSON.stringify(report), idemHash, now).run();
  const reportCount = await db.prepare(
    "SELECT COUNT(DISTINCT actor_agent_id) AS report_count FROM agent_simulation_events WHERE simulation_id = ? AND event_type = 'AGENT_REPORT' AND actor_agent_id IN (?, ?)",
  ).bind(simulationId, run.participant_a, run.participant_b).first<{ report_count?: number }>();
  const complete = Number(reportCount?.report_count ?? 0) >= 2;
  await db.prepare(
    "UPDATE agent_simulation_runs SET status = ?, finished_at = ? WHERE simulation_id = ? AND status IN ('PLANNED','RUNNING')",
  ).bind(complete ? "COMPLETED" : "RUNNING", complete ? now : null, simulationId).run();
  return {
    ok: true,
    idempotent_replay: false,
    simulation_id: simulationId,
    agent_id: actor,
    report,
    report_count: Number(reportCount?.report_count ?? 0),
    required_reports: 2,
    status: complete ? "COMPLETED" : "RUNNING",
    replay_available: complete,
  };
}

async function replayScenario(args: Record<string, unknown>, env: CollisionSimulatorBindings, actor: OgenicAgentId) {
  const db = requireDb(env);
  const simulationId = requireId(args.simulation_id, "SIMULATION_ID_INVALID");
  const run = await db.prepare(
    "SELECT simulation_id, conversation_id, scenario_type, seed, base_revision, created_by, participant_a, participant_b, status, plan_json, created_at, finished_at FROM agent_simulation_runs WHERE simulation_id = ? AND conversation_id = ? LIMIT 1",
  ).bind(simulationId, CONVERSATION_ID).first<SimulationRun>();
  if (!run) return fail("SIMULATION_NOT_FOUND");
  if (run.participant_a !== actor && run.participant_b !== actor) return fail("SIMULATION_PARTICIPANT_FORBIDDEN");
  if (run.status !== "COMPLETED" && run.status !== "ABORTED") return fail("SIMULATION_NOT_COMPLETE");
  const events = await db.prepare(
    "SELECT event_id, simulation_id, sequence_no, event_type, actor_agent_id, fault_label, metadata_json, idempotency_key_hash, created_at FROM agent_simulation_events WHERE simulation_id = ? ORDER BY sequence_no ASC",
  ).bind(simulationId).all<SimEvent>();
  return {
    ok: true,
    simulation_id: run.simulation_id,
    status: run.status,
    scenario_type: run.scenario_type,
    seed: run.seed,
    base_revision: run.base_revision,
    participants: [run.participant_a, run.participant_b],
    plan: JSON.parse(run.plan_json),
    events: (events.results ?? []).map((event) => ({
      event_id: event.event_id,
      sequence_no: event.sequence_no,
      event_type: event.event_type,
      actor_agent_id: event.actor_agent_id,
      fault_label: event.fault_label,
      metadata: JSON.parse(event.metadata_json),
      created_at: event.created_at,
    })),
    environment: "SIMULATED_ONLY",
    live_message_ledger_touched: false,
    live_agent_events_touched: false,
  };
}

export const AGENT_COLLISION_TOOLS = [
  {
    name: "agent_create_collision_scenario",
    title: "OGENIC Collision Lab — create a seeded scenario",
    description: "Create a deterministic, replayable simulated context fault for two authenticated Agent identities. Scenarios include stale context, duplicate delivery, out-of-order messages, session drift, delegation loops and identity-claim mismatch. Writes only isolated simulation tables.",
    inputSchema: {
      type: "object",
      properties: {
        scenario_type: { type: "string", enum: ["STALE_CONTEXT", "DUPLICATE_DELIVERY", "OUT_OF_ORDER", "SESSION_DRIFT", "DELEGATION_LOOP", "IDENTITY_SPOOF"] },
        peer_agent_id: { type: "string", enum: ["gs", "gt", "claude", "deepseek"] },
        seed: { type: "string", maxLength: 120 },
        base_revision: { type: "string", minLength: 1, maxLength: 120 },
      },
      required: ["scenario_type", "peer_agent_id", "base_revision"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    securitySchemes: [{ type: "oauth2", scopes: ["ogenic:simulate"] }],
  },
  {
    name: "agent_get_collision_scenario",
    title: "OGENIC Collision Lab — get assigned view",
    description: "Retrieve only the authenticated agent's assigned simulated observations. The peer's view, fault labels and expected invariants remain hidden until both participants report.",
    inputSchema: {
      type: "object",
      properties: { simulation_id: { type: "string", minLength: 1, maxLength: 120 } },
      required: ["simulation_id"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    securitySchemes: [{ type: "oauth2", scopes: ["ogenic:simulate"] }],
  },
  {
    name: "agent_submit_collision_result",
    title: "OGENIC Collision Lab — submit independent finding",
    description: "Submit an agent's independent fault assessment and resolution proposal. One report per agent per run; reports are not presented as verified facts until replay.",
    inputSchema: {
      type: "object",
      properties: {
        simulation_id: { type: "string", minLength: 1, maxLength: 120 },
        idempotency_key: { type: "string", minLength: 8, maxLength: 180 },
        detected_fault: { type: "boolean" },
        summary: { type: "string", minLength: 1, maxLength: 900 },
        proposed_resolution: { type: "string", minLength: 1, maxLength: 500 },
        evidence_refs: { type: "array", items: { type: "string", maxLength: 120 }, maxItems: 8 },
      },
      required: ["simulation_id", "idempotency_key", "detected_fault", "summary", "proposed_resolution"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    securitySchemes: [{ type: "oauth2", scopes: ["ogenic:simulate"] }],
  },
  {
    name: "agent_replay_collision",
    title: "OGENIC Collision Lab — replay completed run",
    description: "After both participants submit reports, inspect the deterministic injection plan, each isolated view, hidden fault labels and both independent findings. Replay reads only simulation tables.",
    inputSchema: {
      type: "object",
      properties: { simulation_id: { type: "string", minLength: 1, maxLength: 120 } },
      required: ["simulation_id"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    securitySchemes: [{ type: "oauth2", scopes: ["ogenic:simulate"] }],
  },
] as const;

export const AGENT_COLLISION_TOOL_NAMES = new Set<string>(AGENT_COLLISION_TOOLS.map((tool) => tool.name));

export async function callAgentCollisionTool(
  name: string,
  args: Record<string, unknown>,
  env: CollisionSimulatorBindings,
  actorValue: unknown,
) {
  const actor = actorId(actorValue);
  switch (name) {
    case "agent_create_collision_scenario": return createScenario(args, env, actor);
    case "agent_get_collision_scenario": return getScenario(args, env, actor);
    case "agent_submit_collision_result": return submitReport(args, env, actor);
    case "agent_replay_collision": return replayScenario(args, env, actor);
    default: return fail("UNKNOWN_TOOL");
  }
}
