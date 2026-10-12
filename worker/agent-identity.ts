export const OGENIC_AGENT_IDS = ["gs", "gt", "claude", "deepseek"] as const;

export type OgenicAgentId = (typeof OGENIC_AGENT_IDS)[number];

const ALLOWED_AGENT_IDS = new Set<string>(OGENIC_AGENT_IDS);

export function normalizeOgenicAgentId(value: unknown): OgenicAgentId | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  return ALLOWED_AGENT_IDS.has(normalized) ? normalized as OgenicAgentId : null;
}

export function agentDisplayName(value: OgenicAgentId): string {
  switch (value) {
    case "gs": return "GS — Architecture & Independent Review";
    case "gt": return "GT — Engineering & Implementation";
    case "claude": return "Claude — Independent Agent";
    case "deepseek": return "DeepSeek — Data Research";
  }
}
