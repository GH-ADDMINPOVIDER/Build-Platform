export type ProviderId = "openai" | "codex" | "anthropic" | "manus" | "perplexity" | "deepseek" | "gemini" | "xai";
export type ReadinessState = "VERIFIED" | "NOT_MEASURED" | "DEGRADED" | "CONFIGURATION_REQUIRED";
export type ApiReachability = "REACHABLE" | "UNREACHABLE" | "NOT_MEASURED";
export type QuotaState = "AVAILABLE" | "EXHAUSTED" | "RATE_LIMITED" | "NOT_MEASURED";
export type BillingState = "ACTIVE" | "INACTIVE" | "NOT_MEASURED";

export type ProviderReadinessEnv = Record<string, unknown>;

export type ProviderDefinition = {
  id: ProviderId;
  label: string;
  keyEnv: string;
  attestationPrefix: string;
  capabilities: string[];
  cost_mode: "METERED_OR_INCLUDED" | "PROVIDER_ACCOUNT";
  metadata?: {
    url: string;
    headers(apiKey: string): Record<string, string>;
  };
};

export type ProviderReadiness = {
  provider: ProviderId;
  label: string;
  key_present: boolean;
  api_reachable: ApiReachability;
  quota_state: QuotaState;
  billing_state: BillingState;
  cost_mode: ProviderDefinition["cost_mode"];
  last_checked_at: string;
  readiness: ReadinessState;
  capabilities: string[];
  evidence: {
    key: "BOUND" | "MISSING";
    api: "METADATA_GET" | "LOCAL_ATTESTATION" | "NOT_MEASURED";
    quota: "LOCAL_ATTESTATION" | "NOT_MEASURED";
    billing: "LOCAL_ATTESTATION" | "NOT_MEASURED";
  };
};

export const PROVIDERS: ProviderDefinition[] = [
  {
    id: "openai",
    label: "OpenAI / ATHENA",
    keyEnv: "OPENAI_API_KEY",
    attestationPrefix: "OPENAI",
    capabilities: ["reasoning", "research", "code", "tool_calling", "multimodal", "commander"],
    cost_mode: "METERED_OR_INCLUDED",
    metadata: {
      url: "https://api.openai.com/v1/models",
      headers: (key) => ({ Authorization: `Bearer ${key}` }),
    },
  },
  {
    id: "codex",
    label: "Codex Executor",
    keyEnv: "OPENAI_EXECUTOR_API_KEY",
    attestationPrefix: "CODEX",
    capabilities: ["code", "repo_task", "test", "build", "runtime_verify"],
    cost_mode: "METERED_OR_INCLUDED",
    metadata: {
      url: "https://api.openai.com/v1/models",
      headers: (key) => ({ Authorization: `Bearer ${key}` }),
    },
  },
  {
    id: "anthropic",
    label: "Claude / Anthropic",
    keyEnv: "ANTHROPIC_API_KEY",
    attestationPrefix: "ANTHROPIC",
    capabilities: ["reasoning", "code", "tool_calling", "long_context"],
    cost_mode: "PROVIDER_ACCOUNT",
    metadata: {
      url: "https://api.anthropic.com/v1/models",
      headers: (key) => ({ "x-api-key": key, "anthropic-version": "2023-06-01" }),
    },
  },
  {
    id: "manus",
    label: "Manus",
    keyEnv: "MANUS_API_KEY",
    attestationPrefix: "MANUS",
    capabilities: ["long_horizon", "research", "app_build", "agent_delegate"],
    cost_mode: "PROVIDER_ACCOUNT",
  },
  {
    id: "perplexity",
    label: "Perplexity",
    keyEnv: "PERPLEXITY_API_KEY",
    attestationPrefix: "PERPLEXITY",
    capabilities: ["research", "web_evidence", "source_synthesis", "web_realtime"],
    cost_mode: "PROVIDER_ACCOUNT",
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    keyEnv: "DEEPSEEK_API_KEY",
    attestationPrefix: "DEEPSEEK",
    capabilities: ["reasoning", "code", "tool_calling"],
    cost_mode: "PROVIDER_ACCOUNT",
    metadata: {
      url: "https://api.deepseek.com/models",
      headers: (key) => ({ Authorization: `Bearer ${key}` }),
    },
  },
  {
    id: "gemini",
    label: "Gemini",
    keyEnv: "GEMINI_API_KEY",
    attestationPrefix: "GEMINI",
    capabilities: ["multimodal", "long_context", "reasoning", "tool_calling"],
    cost_mode: "PROVIDER_ACCOUNT",
    metadata: {
      url: "https://generativelanguage.googleapis.com/v1beta/models",
      headers: (key) => ({ "x-goog-api-key": key }),
    },
  },
  {
    id: "xai",
    label: "Grok / xAI",
    keyEnv: "XAI_API_KEY",
    attestationPrefix: "XAI",
    capabilities: ["reasoning", "code", "tool_calling", "web_realtime"],
    cost_mode: "PROVIDER_ACCOUNT",
    metadata: {
      url: "https://api.x.ai/v1/models",
      headers: (key) => ({ Authorization: `Bearer ${key}` }),
    },
  },
];

const clean = (value: unknown, max = 4000) => String(value ?? "").trim().slice(0, max);
const has = (env: ProviderReadinessEnv, key: string) => clean(env[key]).length > 0;

function apiAttestation(env: ProviderReadinessEnv, prefix: string): ApiReachability {
  const value = clean(env[`OGENIC_READINESS_${prefix}_API`], 40).toUpperCase();
  return value === "REACHABLE" || value === "UNREACHABLE" ? value : "NOT_MEASURED";
}

function quotaAttestation(env: ProviderReadinessEnv, prefix: string): QuotaState {
  const value = clean(env[`OGENIC_READINESS_${prefix}_QUOTA`], 40).toUpperCase();
  return value === "AVAILABLE" || value === "EXHAUSTED" || value === "RATE_LIMITED" ? value : "NOT_MEASURED";
}

function billingAttestation(env: ProviderReadinessEnv, prefix: string): BillingState {
  const value = clean(env[`OGENIC_READINESS_${prefix}_BILLING`], 40).toUpperCase();
  return value === "ACTIVE" || value === "INACTIVE" ? value : "NOT_MEASURED";
}

async function metadataProbe(provider: ProviderDefinition, key: string, signal?: AbortSignal): Promise<ApiReachability> {
  if (!provider.metadata) return "NOT_MEASURED";
  try {
    const response = await fetch(provider.metadata.url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": "OGENIC-WAVE-PROVIDER-READINESS",
        ...provider.metadata.headers(key),
      },
      signal,
    });
    if (response.status >= 200 && response.status < 300) return "REACHABLE";
    if (response.status === 429) return "REACHABLE";
    return "UNREACHABLE";
  } catch {
    return "UNREACHABLE";
  }
}

function readiness(input: {
  keyPresent: boolean;
  api: ApiReachability;
  quota: QuotaState;
  billing: BillingState;
}): ReadinessState {
  if (!input.keyPresent) return "CONFIGURATION_REQUIRED";
  if (input.api === "UNREACHABLE" || input.quota === "EXHAUSTED" || input.billing === "INACTIVE") return "DEGRADED";
  if (input.api === "REACHABLE" && input.quota === "AVAILABLE" && input.billing === "ACTIVE") return "VERIFIED";
  return "NOT_MEASURED";
}

export async function readProviderReadiness(
  env: ProviderReadinessEnv,
  options: { probe?: boolean; signal?: AbortSignal; now?: Date } = {},
): Promise<ProviderReadiness[]> {
  const checkedAt = (options.now ?? new Date()).toISOString();
  return Promise.all(PROVIDERS.map(async (provider) => {
    const keyPresent = has(env, provider.keyEnv);
    const key = clean(env[provider.keyEnv]);
    const attestedApi = apiAttestation(env, provider.attestationPrefix);
    let api = attestedApi;
    let apiEvidence: ProviderReadiness["evidence"]["api"] = attestedApi === "NOT_MEASURED" ? "NOT_MEASURED" : "LOCAL_ATTESTATION";
    if (options.probe === true && keyPresent && provider.metadata) {
      api = await metadataProbe(provider, key, options.signal);
      apiEvidence = "METADATA_GET";
    }
    const quota = quotaAttestation(env, provider.attestationPrefix);
    const billing = billingAttestation(env, provider.attestationPrefix);
    return {
      provider: provider.id,
      label: provider.label,
      key_present: keyPresent,
      api_reachable: keyPresent ? api : "NOT_MEASURED",
      quota_state: keyPresent ? quota : "NOT_MEASURED",
      billing_state: keyPresent ? billing : "NOT_MEASURED",
      cost_mode: provider.cost_mode,
      last_checked_at: checkedAt,
      readiness: readiness({ keyPresent, api, quota, billing }),
      capabilities: [...provider.capabilities],
      evidence: {
        key: keyPresent ? "BOUND" : "MISSING",
        api: keyPresent ? apiEvidence : "NOT_MEASURED",
        quota: keyPresent && quota !== "NOT_MEASURED" ? "LOCAL_ATTESTATION" : "NOT_MEASURED",
        billing: keyPresent && billing !== "NOT_MEASURED" ? "LOCAL_ATTESTATION" : "NOT_MEASURED",
      },
    } satisfies ProviderReadiness;
  }));
}

const TASK_CAPABILITY: Record<string, string> = {
  research: "research",
  web_research: "web_evidence",
  code: "code",
  repo_task: "repo_task",
  test: "test",
  build: "build",
  reasoning: "reasoning",
  multimodal: "multimodal",
  long_horizon: "long_horizon",
  tool_calling: "tool_calling",
  web_realtime: "web_realtime",
};

export function routeVerifiedProvider(task: string, reports: ProviderReadiness[]) {
  const normalized = clean(task, 80).toLowerCase().replace(/[\s-]+/g, "_");
  const capability = TASK_CAPABILITY[normalized] || normalized;
  if (!capability) return { ok: false as const, code: "TASK_REQUIRED", capability: "", provider: null };
  const selected = reports.find((report) => report.readiness === "VERIFIED" && report.capabilities.includes(capability));
  if (!selected) {
    return {
      ok: false as const,
      code: "NO_VERIFIED_PROVIDER",
      capability,
      provider: null,
      candidates: reports
        .filter((report) => report.capabilities.includes(capability))
        .map((report) => ({ provider: report.provider, readiness: report.readiness })),
    };
  }
  return {
    ok: true as const,
    code: "ROUTE_VERIFIED",
    capability,
    provider: selected.provider,
    readiness: selected.readiness,
  };
}
