import contextPolicy from "../config/agent-context-policy.json";

type BudgetKey = keyof typeof contextPolicy.budgets;

const text = (value: unknown) => String(value ?? "").trim();

export function boundedByBudget(value: unknown, key: BudgetKey) {
  const limit = Number(contextPolicy.budgets[key] ?? 0);
  const normalized = text(value);
  if (!Number.isFinite(limit) || limit <= 0) return "";
  return normalized.slice(0, limit);
}

export function boundedCommand(value: unknown) {
  return boundedByBudget(value, "command_router_chars");
}

export function boundedReadPrompt(value: unknown) {
  return boundedByBudget(value, "research_read_chars");
}

export function boundedCodeContext(value: unknown) {
  return boundedByBudget(value, "code_execution_chars");
}

export function boundedHandoff(value: unknown) {
  return boundedByBudget(value, "handoff_summary_chars");
}

export function boundedResult(value: unknown) {
  return boundedByBudget(value, "result_summary_chars");
}

export function boundedEvidenceExcerpt(value: unknown) {
  return boundedByBudget(value, "evidence_excerpt_chars");
}

export function dedupeEvidenceRefs(values: unknown[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const ref = boundedEvidenceExcerpt(value);
    if (!ref || seen.has(ref)) continue;
    seen.add(ref);
    result.push(ref);
  }
  return result;
}

export function compactResultContract(input: {
  result?: unknown;
  evidence?: unknown[];
  blocked?: unknown;
  next?: unknown;
}) {
  return {
    RESULT: boundedResult(input.result),
    EVIDENCE: dedupeEvidenceRefs(input.evidence ?? []),
    BLOCKED: boundedResult(input.blocked),
    NEXT: boundedResult(input.next),
  };
}

export const AGENT_CONTEXT_POLICY = {
  schema_version: contextPolicy.schema_version,
  scope: contextPolicy.scope,
  hard_rules: contextPolicy.hard_rules,
  execution_control: contextPolicy.execution_control,
  continuation: contextPolicy.continuation,
  selection: contextPolicy.selection,
  retention: contextPolicy.retention,
} as const;
