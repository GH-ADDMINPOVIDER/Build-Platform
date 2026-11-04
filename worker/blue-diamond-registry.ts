export type BlueDiamondState =
  | "LIVE"
  | "DEGRADED"
  | "BRIDGE_ONLY"
  | "CONFIGURATION_REQUIRED"
  | "OFFLINE";

export type BlueDiamondMaturity =
  | "PROVEN"
  | "COMMANDER_CANDIDATE"
  | "CANDIDATE"
  | "TOOL_ONLY"
  | "RUNTIME_ONLY";

export type BlueDiamondActorClass =
  | "controller"
  | "command_agent"
  | "execution_agent"
  | "agent_candidate"
  | "tool"
  | "runtime";

export type BlueDiamondActor = {
  actor_id: string;
  label: string;
  provider: string;
  actor_class: BlueDiamondActorClass;
  maturity: BlueDiamondMaturity;
  state: BlueDiamondState;
  agent_eligible: boolean;
  capabilities: string[];
  route: string;
  runtime: string;
  model: string | null;
  auth_ref: string | null;
  health_ref: string | null;
  quota_ref: string | null;
  preflight: "CHECKIN_ON_CONTEXT_BOUNDARY" | "EVERY_RUN" | "TOOL_POLICY_ONLY";
  priority: number;
};

export type BlueDiamondRegistryEnv = Record<string, unknown>;

function has(env: BlueDiamondRegistryEnv, key: string) {
  return typeof env[key] === "string" && String(env[key]).trim().length > 0;
}

function configured(env: BlueDiamondRegistryEnv, keys: string[]): BlueDiamondState {
  return keys.every((key) => has(env, key)) ? "DEGRADED" : "CONFIGURATION_REQUIRED";
}

function geminiReadVerified(env: BlueDiamondRegistryEnv) {
  return has(env, "GEMINI_API_KEY") &&
    env.OGENIC_READINESS_GEMINI_API === "REACHABLE" &&
    env.OGENIC_READINESS_GEMINI_QUOTA === "AVAILABLE" &&
    env.OGENIC_READINESS_GEMINI_BILLING === "ACTIVE";
}

function deepseekLiveVerified(env: BlueDiamondRegistryEnv) {
  return has(env, "DEEPSEEK_API_KEY") &&
    env.OGENIC_READINESS_DEEPSEEK_API === "REACHABLE" &&
    env.OGENIC_READINESS_DEEPSEEK_QUOTA === "AVAILABLE" &&
    env.OGENIC_READINESS_DEEPSEEK_BILLING === "ACTIVE";
}

export function buildBlueDiamondRegistry(env: BlueDiamondRegistryEnv): BlueDiamondActor[] {
  const actors: BlueDiamondActor[] = [
    {
      actor_id: "chatgpt-main-controller",
      label: "ChatGPT Main Controller",
      provider: "chatgpt",
      actor_class: "controller",
      maturity: "PROVEN",
      state: "BRIDGE_ONLY",
      agent_eligible: true,
      capabilities: ["owner_continuity", "system_supervision", "architecture", "verification", "athena_control"],
      route: "external:chatgpt-bridge",
      runtime: "CHATGPT_SESSION_BRIDGE",
      model: null,
      auth_ref: null,
      health_ref: null,
      quota_ref: "chatgpt-plan",
      preflight: "CHECKIN_ON_CONTEXT_BOUNDARY",
      priority: 1,
    },
    {
      actor_id: "athena-command",
      label: "ATHENA Command",
      provider: "openai",
      actor_class: "command_agent",
      maturity: "COMMANDER_CANDIDATE",
      state: configured(env, ["OPENAI_API_KEY"]),
      agent_eligible: true,
      capabilities: ["canonical_reconcile", "risk_classify", "agent_select", "handoff", "stale_state_detect", "escalate"],
      route: "/api/blue-diamond/preflight",
      runtime: "UNIFIEND_COMMAND_IDENTITY",
      model: "gpt-5.6-sol",
      auth_ref: has(env, "OPENAI_API_KEY") ? "env:OPENAI_API_KEY" : null,
      health_ref: "/api/blue-diamond/registry",
      quota_ref: "openai-project-usage",
      preflight: "EVERY_RUN",
      priority: 2,
    },
    {
      actor_id: "codex-execution-agent",
      label: "Codex Execution Agent",
      provider: "openai-selfhost",
      actor_class: "execution_agent",
      maturity: "PROVEN",
      state: configured(env, ["OPENAI_EXECUTOR_API_KEY"]),
      agent_eligible: true,
      capabilities: ["code_search", "read_file", "write_file", "test", "build", "git_diff", "runtime_verify"],
      route: "/api/codex/status",
      runtime: "UNIFIEND_RUNNER_01_CODEX_EXEC_SERVER",
      model: "codex",
      auth_ref: has(env, "OPENAI_EXECUTOR_API_KEY") ? "env:OPENAI_EXECUTOR_API_KEY" : null,
      health_ref: "/api/openai/selfhost/readiness",
      quota_ref: "openai-environment",
      preflight: "EVERY_RUN",
      priority: 3,
    },
    {
      actor_id: "github-evidence-arm",
      label: "GitHub Evidence Arm",
      provider: "github",
      actor_class: "tool",
      maturity: "TOOL_ONLY",
      state: configured(env, ["GITHUB_TOKEN"]),
      agent_eligible: false,
      capabilities: ["source_state", "commit_evidence", "ci_evidence", "code_search", "git_diff"],
      route: "yellow-stone:github",
      runtime: "REGISTERED_CONNECTOR",
      model: null,
      auth_ref: has(env, "GITHUB_TOKEN") ? "env:GITHUB_TOKEN" : null,
      health_ref: "connector:github",
      quota_ref: "github-rate-limit",
      preflight: "TOOL_POLICY_ONLY",
      priority: 4,
    },
    {
      actor_id: "linear-task-arm",
      label: "Linear Task-State Arm",
      provider: "linear",
      actor_class: "tool",
      maturity: "TOOL_ONLY",
      state: configured(env, ["LINEAR_API_KEY"]),
      agent_eligible: false,
      capabilities: ["task_state", "issue_read", "issue_write", "roadmap_state"],
      route: "yellow-stone:linear",
      runtime: "REGISTERED_CONNECTOR",
      model: null,
      auth_ref: has(env, "LINEAR_API_KEY") ? "env:LINEAR_API_KEY" : null,
      health_ref: "connector:linear",
      quota_ref: "linear-rate-limit",
      preflight: "TOOL_POLICY_ONLY",
      priority: 5,
    },
    {
      actor_id: "manus-candidate",
      label: "Manus Candidate",
      provider: "manus",
      actor_class: "agent_candidate",
      maturity: "CANDIDATE",
      state: configured(env, ["MANUS_API_KEY"]),
      agent_eligible: true,
      capabilities: ["long_horizon_task", "research", "app_build", "agent_delegate"],
      route: "/api/manus/task",
      runtime: "MANUS_PROVIDER",
      model: null,
      auth_ref: has(env, "MANUS_API_KEY") ? "env:MANUS_API_KEY" : null,
      health_ref: "/api/manus/status",
      quota_ref: "manus-provider",
      preflight: "EVERY_RUN",
      priority: 6,
    },
    {
      actor_id: "perplexity-candidate",
      label: "Perplexity Candidate",
      provider: "perplexity",
      actor_class: "agent_candidate",
      maturity: "CANDIDATE",
      state: configured(env, ["PERPLEXITY_API_KEY"]),
      agent_eligible: true,
      capabilities: ["research", "web_evidence", "source_synthesis"],
      route: "provider:perplexity",
      runtime: "EXTERNAL_MODEL_API",
      model: null,
      auth_ref: has(env, "PERPLEXITY_API_KEY") ? "env:PERPLEXITY_API_KEY" : null,
      health_ref: null,
      quota_ref: "perplexity-usage",
      preflight: "EVERY_RUN",
      priority: 7,
    },
    {
      actor_id: "deepseek-candidate",
      label: "DeepSeek READ Specialist",
      provider: "deepseek",
      actor_class: "execution_agent",
      maturity: "PROVEN",
      state: deepseekLiveVerified(env) ? "LIVE" : configured(env, ["DEEPSEEK_API_KEY"]),
      agent_eligible: true,
      capabilities: ["reasoning", "context_load", "code_review"],
      route: "/api/capabilities/execute",
      runtime: "EXTERNAL_MODEL_API",
      model: "deepseek-flash",
      auth_ref: has(env, "DEEPSEEK_API_KEY") ? "env:DEEPSEEK_API_KEY" : null,
      health_ref: "/api/provider-readiness",
      quota_ref: "deepseek-usage",
      preflight: "EVERY_RUN",
      priority: 8,
    },
    {
      actor_id: "claude-candidate",
      label: "Claude Candidate",
      provider: "anthropic",
      actor_class: "agent_candidate",
      maturity: "CANDIDATE",
      state: configured(env, ["ANTHROPIC_API_KEY"]),
      agent_eligible: true,
      capabilities: ["reasoning", "code", "tool_calling", "long_context"],
      route: "provider:anthropic",
      runtime: "EXTERNAL_MODEL_API",
      model: null,
      auth_ref: has(env, "ANTHROPIC_API_KEY") ? "env:ANTHROPIC_API_KEY" : null,
      health_ref: null,
      quota_ref: "anthropic-usage",
      preflight: "EVERY_RUN",
      priority: 9,
    },
    {
      actor_id: "gemini-candidate",
      label: "Gemini READ Specialist",
      provider: "google",
      actor_class: "execution_agent",
      maturity: "PROVEN",
      state: geminiReadVerified(env) ? "LIVE" : configured(env, ["GEMINI_API_KEY"]),
      agent_eligible: true,
      capabilities: ["reasoning", "context_load"],
      route: "/api/capabilities/execute",
      runtime: "EXTERNAL_MODEL_API",
      model: "gemini-3.7-flash",
      auth_ref: has(env, "GEMINI_API_KEY") ? "env:GEMINI_API_KEY" : null,
      health_ref: "/api/provider-readiness",
      quota_ref: "gemini-usage",
      preflight: "EVERY_RUN",
      priority: 10,
    },
    {
      actor_id: "grok-candidate",
      label: "Grok Candidate",
      provider: "xai",
      actor_class: "agent_candidate",
      maturity: "CANDIDATE",
      state: configured(env, ["XAI_API_KEY"]),
      agent_eligible: true,
      capabilities: ["reasoning", "code", "web_realtime", "x_realtime", "tool_calling"],
      route: "/api/xai/responses",
      runtime: "EXTERNAL_MODEL_API",
      model: null,
      auth_ref: has(env, "XAI_API_KEY") ? "env:XAI_API_KEY" : null,
      health_ref: "/api/xai/status",
      quota_ref: "xai-usage",
      preflight: "EVERY_RUN",
      priority: 11,
    },
    {
      actor_id: "meta-model-candidate",
      label: "Meta Model Candidate",
      provider: "meta_model",
      actor_class: "agent_candidate",
      maturity: "CANDIDATE",
      state: configured(env, ["META_MODEL_API_KEY"]),
      agent_eligible: true,
      capabilities: ["reasoning", "code", "multimodal", "long_context", "agentic_coding"],
      route: "/api/meta-model/responses",
      runtime: "EXTERNAL_MODEL_API",
      model: "muse-spark-1.3",
      auth_ref: has(env, "META_MODEL_API_KEY") ? "env:META_MODEL_API_KEY" : null,
      health_ref: "/api/meta-model/status",
      quota_ref: "meta-model-usage",
      preflight: "EVERY_RUN",
      priority: 12,
    },
    {
      actor_id: "copilot-candidate",
      label: "GitHub Copilot Candidate",
      provider: "github-copilot",
      actor_class: "agent_candidate",
      maturity: "CANDIDATE",
      state: "BRIDGE_ONLY",
      agent_eligible: true,
      capabilities: ["code", "repo_task", "agentic_coding"],
      route: "external:copilot",
      runtime: "EXTERNAL_AGENT_SURFACE",
      model: null,
      auth_ref: null,
      health_ref: null,
      quota_ref: "copilot-plan",
      preflight: "EVERY_RUN",
      priority: 13,
    },
    {
      actor_id: "cursor-candidate",
      label: "Cursor Candidate",
      provider: "cursor",
      actor_class: "agent_candidate",
      maturity: "CANDIDATE",
      state: "BRIDGE_ONLY",
      agent_eligible: true,
      capabilities: ["code", "repo_task", "agentic_coding"],
      route: "external:cursor",
      runtime: "EXTERNAL_AGENT_SURFACE",
      model: null,
      auth_ref: null,
      health_ref: null,
      quota_ref: "cursor-plan",
      preflight: "EVERY_RUN",
      priority: 14,
    },
    {
      actor_id: "notion-knowledge-arm",
      label: "Notion Knowledge Arm",
      provider: "notion",
      actor_class: "tool",
      maturity: "TOOL_ONLY",
      state: "CONFIGURATION_REQUIRED",
      agent_eligible: false,
      capabilities: ["knowledge_search", "context_load", "knowledge_write"],
      route: "yellow-stone:notion",
      runtime: "EXTERNAL_CONNECTOR",
      model: null,
      auth_ref: null,
      health_ref: "connector:notion",
      quota_ref: null,
      preflight: "TOOL_POLICY_ONLY",
      priority: 15,
    },
    {
      actor_id: "cloudflare-runtime-arm",
      label: "Cloudflare Runtime Arm",
      provider: "cloudflare",
      actor_class: "runtime",
      maturity: "RUNTIME_ONLY",
      state: "LIVE",
      agent_eligible: false,
      capabilities: ["worker_runtime", "browser_runtime", "d1_runtime", "runtime_evidence"],
      route: "/api/health",
      runtime: "CLOUDFLARE_WORKER",
      model: null,
      auth_ref: null,
      health_ref: "/api/health",
      quota_ref: "cloudflare-plan",
      preflight: "TOOL_POLICY_ONLY",
      priority: 16,
    },
  ];

  return actors.slice(0, 16);
}
