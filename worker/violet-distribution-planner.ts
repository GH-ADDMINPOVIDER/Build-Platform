import type { BlueDiamondActor } from "./blue-diamond-registry";

export type DistributionTask = {
  task_id: string;
  capability: string;
  preferred_agent_id?: string;
};
export type DistributionInput = {
  tasks?: DistributionTask[];
  max_parallel?: number;
  strategy?: "parallel" | "sequential";
};
export type ActiveClaim = { claimed_by?: string | null; status?: string | null };
const idPattern = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}$/;
const capabilityPattern = /^[a-z][a-z0-9_:-]{0,79}$/;
const activeStatuses = new Set(["CLAIMED", "RUNNING", "VERIFYING", "QUEUED"]);
const aliases: Record<string, string[]> = {
  "codex-execution-agent": ["codex-execution-agent", "codex-selfhost", "codex-left-arm", "codex-cto"],
  "deepseek-candidate": ["deepseek-candidate", "deepseek"],
  "gemini-candidate": ["gemini-candidate", "gemini"],
};
const eligible = (actor: BlueDiamondActor) =>
  actor.agent_eligible && actor.actor_class === "execution_agent" &&
  actor.maturity === "PROVEN" && Boolean(actor.auth_ref) &&
  ["LIVE", "DEGRADED"].includes(actor.state);

export function planVioletDistribution(
  request: DistributionInput,
  actors: BlueDiamondActor[],
  claims: ActiveClaim[],
  capacityVerified: boolean,
) {
  const tasks = request?.tasks;
  if (!Array.isArray(tasks) || tasks.length < 1 || tasks.length > 10)
    return { ok: false as const, code: "TASK_COUNT_INVALID", http_status: 400 as const };
  const seen = new Set<string>();
  for (const task of tasks) {
    if (!task || !idPattern.test(task.task_id || "") ||
        !capabilityPattern.test(task.capability || "") ||
        (task.preferred_agent_id != null && !idPattern.test(task.preferred_agent_id)) ||
        seen.has(task.task_id)) {
      return { ok: false as const, code: "INVALID_OR_DUPLICATE_TASK", http_status: 400 as const };
    }
    seen.add(task.task_id);
  }
  const strategy = request.strategy ?? "parallel";
  const maxParallel = request.max_parallel ?? 3;
  if (!["parallel", "sequential"].includes(strategy) ||
      !Number.isSafeInteger(maxParallel) || maxParallel < 1 || maxParallel > 10)
    return { ok: false as const, code: "INVALID_DISTRIBUTION_OPTIONS", http_status: 400 as const };
  const candidates = actors.filter(eligible).sort((a,b) => a.priority-b.priority);
  const reserved = new Set<string>();
  const assignments: Array<Record<string, unknown>> = [];
  const queue: Array<Record<string, unknown>> = [];
  let previous: string | null = null;
  for (const task of tasks) {
    const item = { task_id: task.task_id, capability: task.capability,
      depends_on: strategy === "sequential" && previous ? [previous] : [],
      execution_authority: "YELLOW_STONE_ONLY", auto_executed: false };
    previous = task.task_id;
    const matches = actors.filter(a => a.agent_eligible && a.capabilities.includes(task.capability) &&
      (!task.preferred_agent_id || a.actor_id === task.preferred_agent_id));
    const eligibleMatches = candidates.filter(a => a.capabilities.includes(task.capability) &&
      (!task.preferred_agent_id || a.actor_id === task.preferred_agent_id));
    let reason = "";
    if (!matches.length) reason = "BLOCKED_NO_BLUE_CAPABILITY";
    else if (!eligibleMatches.length) reason = "BLOCKED_UNVERIFIED_AGENT";
    else if (!capacityVerified) reason = "BLOCKED_D1_CAPACITY_UNVERIFIED";
    const selected = eligibleMatches.find(a => !reserved.has(a.actor_id) &&
      !(claims || []).some(c => activeStatuses.has(String(c.status || "").toUpperCase()) &&
        (aliases[a.actor_id] || [a.actor_id]).includes(String(c.claimed_by || "").toLowerCase())));
    if (!reason && !selected) reason = "QUEUED_AGENT_BUSY";
    if (!reason && (assignments.length >= maxParallel ||
      (strategy === "sequential" && assignments.length > 0)))
      reason = "QUEUED_PARALLEL_LIMIT";
    if (reason || !selected) {
      queue.push({ ...item, status: reason || "BLOCKED_NO_AGENT" });
      continue;
    }
    reserved.add(selected.actor_id);
    assignments.push({ ...item, agent_id: selected.actor_id, provider: selected.provider,
      runtime: selected.runtime,
      status: selected.state === "LIVE" ? "PLANNED_AWAITING_YELLOW" : "PLANNED_BLUE_PREFLIGHT_REQUIRED",
      requires_blue_preflight: true, ready_to_execute: false });
  }
  return {
    ok: true as const, http_status: 200 as const,
    runtime: "VIOLET_BLUE_DISTRIBUTION_V1",
    controller: "VIOLET_STONE_04", source_registry: "BLUE_DIAMOND_03",
    strategy, max_parallel: maxParallel, capacity_verified: capacityVerified,
    assignments, queue, planned_count: assignments.length, waiting_count: queue.length,
    blue_preflight_route: "/api/blue-diamond/preflight",
    violet_handoff_route: "/api/violet/handoff",
    yellow_stone_route: "/api/capabilities/execute",
    execution_authority: "YELLOW_STONE_ONLY",
    planning_only: true, direct_execution_bypass: false, persisted: false,
  };
}
