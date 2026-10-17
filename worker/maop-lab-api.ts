import { Hono } from "hono";
import operatorRegistry from "../config/ammonite-maop-operator-registry.json";
import { hasOwnerOrOpsAccess, type AuthBindings } from "./app-auth";
import { createCapabilityExecutionApi } from "./capability-execution-api";
import {
  MAOP_PROTOCOL_VERSION,
  MaopReferenceRuntime,
  ReferenceReadAdapter,
  type MaopCapability,
  type MaopTask,
} from "../packages/maop-core/src/index.js";
import { MaopGithubBridge } from "../packages/maop-github-harness/src/bridge.js";

type LabBindings = AuthBindings & Record<string, unknown>;
type Env = { Bindings: LabBindings };
type CoreScenario =
  | "happy_path"
  | "replay"
  | "protocol_mismatch"
  | "approval_gate"
  | "secret_reject"
  | "ruby_reject";

type CoreBody = { scenario?: CoreScenario };
type GithubBody = { path?: unknown };

const executionApi = createCapabilityExecutionApi();
const api = new Hono<Env>();

const noStore = { "Cache-Control": "no-store" };

function bounded(value: unknown, max: number) {
  return String(value ?? "").trim().slice(0, max);
}

function capability(permission: "READ" | "WRITE"): MaopCapability {
  return {
    capability_id: permission === "READ" ? "lab.reference.read" : "lab.reference.write",
    provider_id: "ogenic-lab",
    adapter_id: permission === "READ" ? "reference-sdk" : "reference-cli-write",
    permission_class: permission,
    environment: "staging",
    input_schema: { type: "object" },
    output_schema: { type: "object" },
    evidence_required: true,
    capability_version: "1",
  };
}

function task(capabilityId: string, permission: "READ" | "WRITE", input: Record<string, unknown>, protocol: string): MaopTask {
  return {
    task_id: `maop_lab_${crypto.randomUUID()}`,
    actor_id: "maop-web-lab",
    capability_id: capabilityId,
    intent: "MA-OP web lab first-impression proof",
    input,
    environment: "staging",
    idempotency_key: `maop-lab-${crypto.randomUUID()}`,
    requested_permission: permission,
    supported_protocol_versions: [protocol],
  };
}

async function requireLabAuth(request: Request, env: LabBindings) {
  return hasOwnerOrOpsAccess(request, env);
}

api.get("/api/maop/lab/status", async (c) => {
  if (!(await requireLabAuth(c.req.raw, c.env))) {
    return c.json({ ok: false, code: "REAUTH_REQUIRED", role: "owner" }, 401, noStore);
  }
  return c.json({
    ok: true,
    lab: "MAOP_WEB_LAB_V1",
    protocol_version: MAOP_PROTOCOL_VERSION,
    runtime: "Cloudflare Worker",
    canonical_branch: "phase-vi-provider-incentive-metering",
    core_scenarios: [
      "happy_path",
      "replay",
      "protocol_mismatch",
      "approval_gate",
      "secret_reject",
      "ruby_reject",
    ],
    live_bridges: {
      github_file_read: true,
      github_other_reads: false,
      writes: false,
      paid_providers: false,
    },
    policy: {
      owner_or_ops_auth_required: true,
      yellow_execution_authority: "YELLOW_STONE_ONLY",
      direct_provider_bypass: false,
      schema_change: false,
    },
  }, 200, noStore);
});

// Owner-only capability catalog: a disclosure of known actor readiness, NOT an executable grant.
api.get("/api/maop/lab/owner-capabilities", async (c) => {
  if (!(await requireLabAuth(c.req.raw, c.env))) {
    return c.json({ ok: false, code: "REAUTH_REQUIRED", role: "owner" }, 401, noStore);
  }
  const actors = operatorRegistry.actors.map((actor) => ({
    id: actor.id,
    provider: actor.provider,
    kind: actor.kind,
    readiness: actor.readiness,
    requested_capabilities: actor.requested_capabilities,
    granted_capabilities: actor.granted_capabilities,
    platform_proven_capabilities: actor.platform_proven_capabilities,
    platform_evidence: actor.platform_evidence,
    certificate_status: actor.certificate_status,
  }));
  return c.json({
    ok: true,
    schema: "ogenic.ammonite.owner-capability-catalog.v1",
    catalog_only: true,
    does_not_authorize_execution: true,
    canonical_gateway: "wave-runner-01",
    evidence_policy: "PROOF_REQUIRED_PER_IDENTITY_AND_CAPABILITY",
    certificate_manager: {
      project_slug: operatorRegistry.certificate_manager.project_slug,
      status: operatorRegistry.certificate_manager.certificate_search,
      certificate_issued: operatorRegistry.certificate_manager.issued_from_infisical,
    },
    actors,
  }, 200, noStore);
});

api.post("/api/maop/lab/core", async (c) => {
  if (!(await requireLabAuth(c.req.raw, c.env))) {
    return c.json({ ok: false, code: "REAUTH_REQUIRED", role: "owner" }, 401, noStore);
  }

  const body = await c.req.json<CoreBody>().catch(() => ({} as CoreBody));
  const scenario: CoreScenario = [
    "happy_path",
    "replay",
    "protocol_mismatch",
    "approval_gate",
    "secret_reject",
    "ruby_reject",
  ].includes(String(body.scenario)) ? body.scenario as CoreScenario : "happy_path";

  const permission = scenario === "approval_gate" ? "WRITE" as const : "READ" as const;
  const cap = capability(permission);
  const runtime = new MaopReferenceRuntime({
    yellow_authorize: async ({ capability: current }) => ({
      allowed: true,
      approval_required: current.permission_class !== "READ",
      code: current.permission_class === "READ" ? "YELLOW_READ_ALLOWED" : "YELLOW_APPROVAL_REQUIRED",
    }),
    ruby_verify: async ({ adapter_result }) => ({
      verified: scenario !== "ruby_reject" && adapter_result.ok && adapter_result.evidence_refs.length > 0,
      evidence_ref: scenario === "ruby_reject" ? undefined : "ruby:maop-web-lab:verified",
    }),
    check_cost: async () => ({ allowed: true, code: "ZERO_COST_WEB_LAB" }),
  });

  runtime.registerActor({
    actor_id: "maop-web-lab",
    actor_class: "human",
    role: "owner-test-surface",
    provider: "ogenic",
    runtime: "cloudflare-worker",
    capabilities: [cap.capability_id],
    readiness: "VERIFIED",
  });
  runtime.registerCapability(cap);
  runtime.registerAdapter(new ReferenceReadAdapter(
    permission === "READ" ? "sdk" : "cli",
    cap.adapter_id,
  ));

  const input = scenario === "secret_reject"
    ? { api_key: "sk-example-secret-value-123456" }
    : { query: "first impression from real WAVE staging" };
  const protocol = scenario === "protocol_mismatch" ? "9.9.9" : MAOP_PROTOCOL_VERSION;
  const request = task(cap.capability_id, permission, input, protocol);
  const first = await runtime.run(request);

  if (scenario === "replay") {
    const second = await runtime.run(request);
    return c.json({ ok: true, scenario, first, second }, 200, noStore);
  }

  return c.json({ ok: true, scenario, result: first }, 200, noStore);
});

api.post("/api/maop/lab/github", async (c) => {
  if (!(await requireLabAuth(c.req.raw, c.env))) {
    return c.json({ ok: false, code: "REAUTH_REQUIRED", role: "owner" }, 401, noStore);
  }

  const body = await c.req.json<GithubBody>().catch(() => ({} as GithubBody));
  const path = bounded(body.path, 500) || "package.json";

  const bridge = new MaopGithubBridge({
    defaultActorId: "maop-web-lab",
    async executeYellow(request) {
      if (request.capability !== "github.file.read") {
        return {
          ok: false,
          code: "LAB_CAPABILITY_NOT_ENABLED",
          verification: { status: "blocked" },
        };
      }
      const url = new URL(c.req.url);
      url.pathname = "/api/capabilities/execute";
      const headers = new Headers(c.req.raw.headers);
      headers.set("content-type", "application/json");
      headers.set("x-ogenic-command-origin", "maop-web-lab");
      const internal = new Request(url.toString(), {
        method: "POST",
        headers,
        body: JSON.stringify({
          intent: `read ${path}`,
          capability: "read_file",
          provider: "github",
          environment: "staging",
          allowMigration: false,
          allowOptional: false,
          input: { path },
        }),
      });
      const response = await executionApi.fetch(internal, c.env as never, {} as never);
      return await response.json().catch(() => ({
        ok: false,
        code: `YELLOW_HTTP_${response.status}`,
        verification: { status: "failed" },
      }));
    },
  });

  const result = await bridge.execute("github.file.read", { path }, { agentId: "maop-web-lab" });
  return c.json({
    ok: result.ok,
    mode: "MAOP_GITHUB_READ_BRIDGE",
    note: "Yellow executes the real GitHub READ. Ruby result-specific verification is intentionally not wired in this lab yet, so retention_eligible remains false.",
    result,
  }, result.ok ? 200 : 409, noStore);
});

export function createMaopLabApi() {
  return api;
}
