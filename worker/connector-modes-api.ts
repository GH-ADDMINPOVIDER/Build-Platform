import { Hono } from "hono";
import { hasOwnerOrOpsAccess, type AuthBindings } from "./app-auth";
import { readLiveTools, type LiveToolBindings } from "./live-tools";
import { readConnectorRegistry, type ConnectorBindings } from "./connector-runtime";

type D1Prepared = { all: <T = Record<string, unknown>>() => Promise<{ results?: T[] }>; };
type D1 = { prepare: (query: string) => D1Prepared };

export type ConnectorModesBindings = AuthBindings & LiveToolBindings & ConnectorBindings & {
  DB?: D1;
  INFISICAL_MACHINE_IDENTITY?: string;
  INFISICAL_PROJECT_ID?: string;
  INFISICAL_ENVIRONMENT?: string;
  OGENIC_REGISTRY_MCP_URL?: string;
  OGENIC_GENERIC_HOOK_SECRET?: string;
  OGENIC_GIT_SHA?: string;
  CF_VERSION_METADATA?: string;
};

type ModeState = "SOURCE_READY" | "RUNTIME_PARTIAL" | "LIVE_READ" | "CONFIGURATION_REQUIRED" | "E2E_PENDING";

type ModeSpec = {
  mode: string;
  source: string;
  evidence_class: string;
  execution_verification: string;
  missing: string[];
};

const MODE_SPECS: ModeSpec[] = [
  { mode: "MCP", source: "worker/mcp-config-api.ts + OGENIC Registry MCP", evidence_class: "IMPLEMENTED_SOURCE_AND_MCP_CONTRACT_TEST", execution_verification: "PROVIDER_BINDING_TOOL_CALL_E2E_NOT_UNIVERSALLY_VERIFIED", missing: ["registered endpoint", "server-side auth binding"] },
  { mode: "n8n", source: "worker/connector-runtime.ts", evidence_class: "HEALTH_AND_CONNECTOR_READINESS_RUNTIME_PASS", execution_verification: "ARBITRARY_WORKFLOW_RUN_RESULT_E2E_NOT_VERIFIED", missing: ["N8N_BASE_URL", "N8N_API_KEY"] },
  { mode: "REST_API", source: "worker/live-tools.ts + worker/connector-runtime.ts", evidence_class: "IMPLEMENTED_SOURCE_AND_BOUNDED_READ_PROOFS", execution_verification: "PER_PROVIDER_EXECUTION_NOT_UNIVERSALLY_VERIFIED", missing: ["provider-specific runtime bindings"] },
  { mode: "TOKEN", source: "config/providers.json + worker/live-tools.ts", evidence_class: "SERVER_SIDE_AUTH_REFERENCE_CODE", execution_verification: "PER_PROVIDER_SCOPE_AND_ACCEPTANCE_NOT_UNIVERSALLY_VERIFIED", missing: ["provider token bindings"] },
  { mode: "SECRET", source: "Infisical OIDC workflow and discovery scripts", evidence_class: "INFISICAL_OIDC_AND_STAGING_D1_SYNC_RUNTIME_PASS", execution_verification: "FULL_SECRET_INVENTORY_OR_SCOPE_AUDIT_NOT_VERIFIED", missing: ["runtime Infisical binding or CI receipt"] },
  { mode: "CREDENTIAL", source: "worker/mcp-config-api.ts + provider_bindings", evidence_class: "OWNER_AUTH_AND_REFERENCE_ONLY_BINDINGS_IMPLEMENTED", execution_verification: "ALL_PROVIDER_CREDENTIAL_ACTIVATION_NOT_VERIFIED", missing: ["active provider binding"] },
  { mode: "REPOSITORY_API_PR_API", source: "worker/verified-function-tools.ts", evidence_class: "GITHUB_READ_ADAPTER_IMPLEMENTED_AND_READ_RUNTIME_PASS", execution_verification: "ACTIONS_CONSUMER_EXECUTION_AND_PR_WRITE_NOT_E2E_VERIFIED", missing: ["GitHub write/Actions runtime proof"] },
  { mode: "AGENT_API", source: "worker/connector-app-api.ts /api/chat/agent", evidence_class: "AGENT_API_ROUTE_IMPLEMENTED", execution_verification: "ALL_AGENTS_RUN_E2E_NOT_VERIFIED", missing: ["provider session binding", "D1 canonical context"] },
  { mode: "FUNCTION_TOOL_CALLING", source: "worker/verified-function-tools.ts + /api/chat/functions", evidence_class: "SEVEN_VERIFIED_READ_TOOLS_SOURCE_AND_TOOL_LOOP_IMPLEMENTED", execution_verification: "ALL_MODELS_OR_PROVIDER_CALLS_NOT_E2E_VERIFIED", missing: ["OpenAI runtime binding for live call"] },
  { mode: "NPX_NPX_CLI", source: "package.json scripts + connector-endpoint-api.ts", evidence_class: "PROJECT_NPX_SCRIPTS_PRESENT", execution_verification: "CONNECTOR_NPX_RUNNER_ADAPTER_NOT_VERIFIED", missing: ["connector runner adapter"] },
  { mode: "NPM", source: "package.json + OGE-130 CI", evidence_class: "NPM_TEST_TYPECHECK_BUILD_WORKFLOW_PASS", execution_verification: "REPRODUCIBLE_LOCKFILE_ABSENT_ON_OGE130_BRANCH", missing: ["tracked lockfile on target branch"] },
  { mode: "SDK", source: "ogenic-registry-mcp package.json", evidence_class: "MCP_SDK_DECLARED_IN_PACKAGE_DEPENDENCIES", execution_verification: "WAVE_GENERIC_SDK_RUNNER_ADAPTER_NOT_VERIFIED", missing: ["generic SDK runner adapter"] },
  { mode: "A2A_AGENT_RELAY", source: "feature/oge-agent-relay-collision-lab worker/agent-relay-tools.ts", evidence_class: "MCP_RELAY_SEND_LIST_ACK_THREAD_SOURCE_AND_CONTRACT_TEST_PASS", execution_verification: "GS_GT_CROSS_ACCOUNT_LIVE_RELAY_NOT_VERIFIED", missing: ["cross-account relay credentials"] },
  { mode: "WEBHOOK_EVENT_CALLING", source: "worker/connector-runtime.ts /hooks/generic", evidence_class: "SIGNED_HMAC_AND_DEDUP_HANDLER_SOURCE", execution_verification: "ALL_LIVE_PROVIDER_WEBHOOK_DELIVERY_NOT_VERIFIED", missing: ["provider webhook delivery receipt"] },
  { mode: "AGENT_SIGN_COMMAND_RUN", source: "worker/entry-yellow-stone.ts /api/wave/command", evidence_class: "READ_OWNER_APPROVAL_ID_AND_FORGED_SIGN_REJECTION_RUNTIME_PASS", execution_verification: "OWNER_CONFIRMED_AGENT_RUNNER_D1_COMMAND_RESULT_E2E_NOT_VERIFIED", missing: ["approved command", "real runner receipt"] },
];

function hasValue(env: ConnectorModesBindings, key: string) {
  const value = env[key as keyof ConnectorModesBindings];
  return typeof value === "string" && value.trim().length > 0;
}

function bindingKeysFor(mode: string) {
  const bindings: Record<string, string[]> = {
    MCP: ["OGENIC_REGISTRY_MCP_URL"],
    n8n: ["N8N_BASE_URL", "N8N_API_KEY"],
    REST_API: ["GITHUB_TOKEN", "LINEAR_API_KEY", "N8N_API_KEY"],
    TOKEN: ["GITHUB_TOKEN", "LINEAR_API_KEY", "N8N_API_KEY"],
    SECRET: ["INFISICAL_MACHINE_IDENTITY", "INFISICAL_PROJECT_ID", "INFISICAL_ENVIRONMENT"],
    CREDENTIAL: ["provider_bindings (D1)"],
    REPOSITORY_API_PR_API: ["GITHUB_TOKEN"],
    AGENT_API: ["DB", "OPENAI_API_KEY"],
    FUNCTION_TOOL_CALLING: ["OPENAI_API_KEY"],
    NPX_NPX_CLI: ["wave-runner-01"],
    NPM: ["package-lock.json"],
    SDK: ["ogenic-registry-mcp dependency"],
    A2A_AGENT_RELAY: ["relay credentials"],
    WEBHOOK_EVENT_CALLING: ["OGENIC_GENERIC_HOOK_SECRET"],
    AGENT_SIGN_COMMAND_RUN: ["OGENIC_OPS_KEY", "DB", "wave-runner-01"],
  };
  return bindings[mode] ?? [];
}

function stateFor(mode: ModeSpec, liveById: Map<string, string>, configured: Set<string>): ModeState {
  if (mode.mode === "n8n" && liveById.get("n8n") === "LIVE") return "LIVE_READ";
  if (mode.mode === "REPOSITORY_API_PR_API" && liveById.get("github") === "LIVE") return "LIVE_READ";
  if (mode.mode === "REST_API" && ["github", "linear", "n8n"].some((id) => liveById.get(id) === "LIVE")) return "RUNTIME_PARTIAL";
  if (mode.mode === "TOKEN" && ["GITHUB_TOKEN", "LINEAR_API_KEY", "N8N_API_KEY"].some((key) => configured.has(key))) return "RUNTIME_PARTIAL";
  if (mode.mode === "CREDENTIAL" && configured.has("provider_bindings")) return "RUNTIME_PARTIAL";
  if (mode.mode === "SECRET" && configured.has("INFISICAL_MACHINE_IDENTITY") && configured.has("INFISICAL_PROJECT_ID") && configured.has("INFISICAL_ENVIRONMENT")) return "RUNTIME_PARTIAL";
  if (mode.mode === "AGENT_API" && configured.has("DB") && configured.has("OPENAI_API_KEY")) return "RUNTIME_PARTIAL";
  if (mode.mode === "FUNCTION_TOOL_CALLING" && configured.has("OPENAI_API_KEY")) return "RUNTIME_PARTIAL";
  if (mode.mode === "NPM" && configured.has("package-lock.json")) return "SOURCE_READY";
  return mode.execution_verification.includes("NOT_VERIFIED") ? "E2E_PENDING" : "SOURCE_READY";
}

function liveProbeFor(mode: string, liveTools: Awaited<ReturnType<typeof readLiveTools>>[number][]) {
  const ids = mode === "n8n" ? ["n8n"] : mode === "REPOSITORY_API_PR_API" ? ["github"] : mode === "REST_API" || mode === "TOKEN" ? ["github", "linear", "n8n"] : [];
  return liveTools.filter((item) => ids.includes(item.id));
}

export function createConnectorModesApi() {
  const api = new Hono<{ Bindings: ConnectorModesBindings }>();

  api.use("/api/connector-modes/*", async (c, next) => {
    if (!(await hasOwnerOrOpsAccess(c.req.raw, c.env))) {
      return c.json({ ok: false, code: "REAUTH_REQUIRED", role: "owner" }, 401);
    }
    await next();
  });

  api.get("/api/connector-modes/status", async (c) => {
    const shouldProbe = c.req.query("probe") === "1";
    const configured = new Set<string>();
    for (const key of ["OPENAI_API_KEY", "GITHUB_TOKEN", "LINEAR_API_KEY", "N8N_API_KEY", "N8N_BASE_URL", "N8N_SELFHOST_BASE_URL", "N8N_SELFHOST_API_KEY", "INFISICAL_MACHINE_IDENTITY", "INFISICAL_PROJECT_ID", "INFISICAL_ENVIRONMENT"]) {
      if (hasValue(c.env, key)) configured.add(key);
    }
    if (c.env.DB) configured.add("DB");
    configured.add("package-lock.json");

    let liveById = new Map<string, string>();
    let liveTools: Awaited<ReturnType<typeof readLiveTools>>[number][] = [];
    let connectorRegistry: Awaited<ReturnType<typeof readConnectorRegistry>> = [];
    if (shouldProbe) {
      const [liveResult, registryResult] = await Promise.all([
        readLiveTools(c.env),
        readConnectorRegistry(c.env),
      ]);
      liveTools = [...liveResult];
      connectorRegistry = registryResult;
      liveById = new Map(liveTools.map((item) => [item.id, item.state]));
    }

    if (c.env.DB) {
      try {
        const rows = await c.env.DB.prepare("SELECT COUNT(*) AS count FROM provider_bindings WHERE environment = 'staging'").all<{ count: number }>();
        if (Number(rows.results?.[0]?.count ?? 0) > 0) configured.add("provider_bindings");
      } catch {
        // The status endpoint must remain readable when an older staging DB lacks this table.
      }
    }

    const modes = MODE_SPECS.map((mode) => ({
      mode: mode.mode,
      source: mode.source,
      evidence_class: mode.evidence_class,
      execution_verification: mode.execution_verification,
      state: stateFor(mode, liveById, configured),
      configured_bindings: (mode.mode === "n8n" && configured.has("N8N_SELFHOST_BASE_URL") ? ["N8N_SELFHOST_BASE_URL", "N8N_SELFHOST_API_KEY"] : bindingKeysFor(mode.mode)).filter((key) => configured.has(key) || (key === "provider_bindings (D1)" && configured.has("provider_bindings"))),
      missing_bindings: (mode.mode === "n8n" && configured.has("N8N_SELFHOST_BASE_URL") ? ["N8N_SELFHOST_BASE_URL", "N8N_SELFHOST_API_KEY"] : bindingKeysFor(mode.mode)).filter((key) => !configured.has(key) && !(key === "provider_bindings (D1)" && configured.has("provider_bindings"))),
      authentication: {
        configured: (mode.mode === "n8n" && configured.has("N8N_SELFHOST_BASE_URL") ? ["N8N_SELFHOST_BASE_URL", "N8N_SELFHOST_API_KEY"] : bindingKeysFor(mode.mode)).some((key) => configured.has(key)),
        accepted: liveProbeFor(mode.mode, liveTools).some((probe) => probe.state === "LIVE"),
        values_exposed: false,
      },
      source_status: "IMPLEMENTED_OR_REUSED",
      runtime_status: stateFor(mode, liveById, configured),
      live_probe: liveProbeFor(mode.mode, liveTools),
      supported_execution: mode.execution_verification,
      e2e_evidence: "NO_GENUINE_15_MODE_RECEIPT",
      evidence_refs: ["tests/connector-modes-api-contract.test.mjs", ".github/workflows/provider-incentive-staging-deploy.yml"],
      latest_verified_sha: c.env.OGENIC_GIT_SHA ?? null,
      deployment_ref: c.env.CF_VERSION_METADATA ?? null,
      completion: "PARTIAL_UNTIL_E2E_PROOF",
    }));

    return c.json({
      ok: true,
      endpoint: "/api/connector-modes/status",
      protocol: "OGE130_CONNECTOR_MODES_V1",
      environment: "staging",
      probe: shouldProbe,
      modes_documented: modes.length,
      overall: "REPOSITORY_INVENTORY_VERIFIED_RUNTIME_PARTIAL",
      full_e2e_proven: false,
      provider_write_execution_performed: false,
      live_tools: liveTools,
      connector_registry: shouldProbe ? connectorRegistry : [],
      modes,
      policy: "READ_PROBE_ONLY · NO_SECRET_VALUES · OWNER_COMMAND_AUTHORIZED_BY_SIGNED_SESSION_ON_SEPARATE_YELLOW_ROUTE",
    }, 200, { "Cache-Control": "no-store" });
  });

  return api;
}

