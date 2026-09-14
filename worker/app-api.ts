import { Hono, type Context, type Next } from "hono";
import { requireOwnerSession, type AuthBindings } from "./app-auth";
import { readIncentiveSnapshot, type IncentiveD1 } from "./provider-incentives";
import { readLiveTools, type LiveToolBindings } from "./live-tools";
import toolkitManifest from "../assets/toolkit-manifest.json";

type D1Result<T = Record<string, unknown>> = { results?: T[]; success?: boolean };
type D1Prepared = {
  bind: (...values: unknown[]) => D1Prepared;
  all: <T = Record<string, unknown>>() => Promise<D1Result<T>>;
  first: <T = Record<string, unknown>>() => Promise<T | null>;
  run: () => Promise<unknown>;
};
type D1Like = { prepare: (query: string) => D1Prepared };

export type AppBindings = AuthBindings & LiveToolBindings & {
  DB?: D1Like;
  OPENAI_API_KEY?: string;
  OGENIC_GIT_SHA?: string;
  OGENIC_PHASE?: string;
  OGENIC_RUNTIME?: string;
};

type AppEnv = { Bindings: AppBindings };

type TaskCreate = {
  title?: unknown;
  capability?: unknown;
  priority?: unknown;
  source?: unknown;
};

type OpenAIStatusSummary = {
  page?: { updated_at?: string };
  status?: { description?: string; indicator?: string };
  components?: Array<{ name?: string; status?: string }>;
  incidents?: Array<{ name?: string; status?: string; impact?: string }>;
};

function clean(value: unknown, max: number) {
  return String(value ?? "").trim().slice(0, max);
}

function makeId(prefix: string) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function componentStatus(components: OpenAIStatusSummary["components"], name: string) {
  return components?.find((component) => component.name?.toLowerCase() === name.toLowerCase())?.status ?? "unknown";
}

export function createAppApi() {
  const api = new Hono<AppEnv>();

  const requireProtectedAppRoute = async (c: Context<AppEnv>, next: Next) => {
    const denied = await requireOwnerSession(c);
    if (denied) return denied;
    if (!c.env.DB) return c.json({ ok: false, code: "CONFIGURATION_REQUIRED", missing: "D1 binding DB" }, 503);
    await next();
  };

  api.use("/api/dashboard", requireProtectedAppRoute);
  api.use("/api/tools", requireProtectedAppRoute);
  api.use("/api/tasks", requireProtectedAppRoute);
  api.use("/api/openai-status", requireProtectedAppRoute);
  api.use("/api/toolkit-status", requireProtectedAppRoute);
  api.use("/api/chat/transcribe", requireProtectedAppRoute);

  api.get("/api/dashboard", async (c) => {
    const db = c.env.DB!;
    const [tasks, taskCounts, runs, runCounts, versions, events, incentives, tools] = await Promise.all([
      db.prepare(
        "SELECT id, title, capability, status, priority, claimed_by, linear_issue_id, github_repo, github_pr_number, source_ref, updated_at, created_at FROM agent_tasks ORDER BY updated_at DESC LIMIT 40",
      ).all(),
      db.prepare("SELECT status, COUNT(*) AS count FROM agent_tasks GROUP BY status ORDER BY status").all(),
      db.prepare(
        "SELECT id, workflow_id, workflow_version, status, current_node_id, error_json, created_at, updated_at FROM runs ORDER BY updated_at DESC LIMIT 30",
      ).all(),
      db.prepare("SELECT status, COUNT(*) AS count FROM runs GROUP BY status ORDER BY status").all(),
      db.prepare(
        "SELECT workflow_id, MAX(version) AS version, MAX(created_at) AS created_at FROM workflow_versions GROUP BY workflow_id ORDER BY workflow_id LIMIT 30",
      ).all(),
      db.prepare(
        "SELECT id, task_id, event_type, actor, external_ref, created_at FROM agent_events ORDER BY created_at DESC LIMIT 20",
      ).all(),
      readIncentiveSnapshot(db as IncentiveD1),
      readLiveTools(c.env),
    ]);

    return c.json({
      ok: true,
      app: { name: "OGENIC AI", version: "0.2", phase: c.env.OGENIC_PHASE ?? "VI" },
      runtime: {
        provider: c.env.OGENIC_RUNTIME ?? "cloudflare",
        database: "D1_BOUND",
        git_sha: clean(c.env.OGENIC_GIT_SHA, 80) || "UNPINNED",
        branch: c.env.OGENIC_GITHUB_BRANCH ?? "phase-vi-provider-incentive-metering",
      },
      tasks: tasks.results ?? [],
      task_counts: taskCounts.results ?? [],
      runs: (runs.results ?? []).map((run) => ({ ...run, error_json: run.error_json ? "REDACTED_ERROR_AVAILABLE" : null })),
      run_counts: runCounts.results ?? [],
      workflows: versions.results ?? [],
      events: events.results ?? [],
      incentives,
      tools,
    }, 200, { "Cache-Control": "no-store" });
  });

  api.get("/api/tools", async (c) => c.json({ ok: true, tools: await readLiveTools(c.env) }, 200, { "Cache-Control": "no-store" }));

  api.get("/api/toolkit-status", async (c) => {
    const tools = await readLiveTools(c.env);
    const live = tools.filter((tool) => tool.state === "LIVE").length;
    const state = live === tools.length ? "READY" : live > 0 ? "DEGRADED" : "CONFIGURATION_REQUIRED";
    return c.json({
      ok: true,
      label: "OGENIC GOD MODE",
      public_toolkit: toolkitManifest.name,
      version: toolkitManifest.version,
      command_prefix: toolkitManifest.command_prefix,
      god_mode_contract: true,
      runtime_state: state,
      live_tools: live,
      total_tools: tools.length,
      branch: c.env.OGENIC_GITHUB_BRANCH ?? "phase-vi-provider-incentive-metering",
      git_sha: clean(c.env.OGENIC_GIT_SHA, 80) || "UNPINNED",
      note: "GOD MODE is the internal execution contract of OGENIC Phase VI.",
    }, 200, { "Cache-Control": "no-store" });
  });

  api.get("/api/openai-status", async (c) => {
    try {
      const response = await fetch("https://status.openai.com/api/v2/summary.json", {
        headers: { Accept: "application/json", "User-Agent": "ogenic-phase-vi-staging" },
      });
      const body = await response.json().catch(() => ({})) as OpenAIStatusSummary;
      if (!response.ok) throw new Error(`HTTP_${response.status}`);
      return c.json({
        ok: true,
        overall: body.status?.description ?? "Unknown",
        indicator: body.status?.indicator ?? "unknown",
        updated_at: body.page?.updated_at ?? null,
        components: {
          responses: componentStatus(body.components, "Responses"),
          conversations: componentStatus(body.components, "Conversations"),
          files: componentStatus(body.components, "Files"),
          voice: componentStatus(body.components, "Voice mode"),
          realtime: componentStatus(body.components, "Realtime"),
        },
        incidents: (body.incidents ?? []).slice(0, 3).map((incident) => ({
          name: clean(incident.name, 180),
          status: clean(incident.status, 60),
          impact: clean(incident.impact, 60),
        })),
        source: "status.openai.com",
      }, 200, { "Cache-Control": "no-store" });
    } catch (error) {
      return c.json({
        ok: false,
        code: "OPENAI_STATUS_UNAVAILABLE",
        message: clean(error instanceof Error ? error.message : error, 120),
      }, 502, { "Cache-Control": "no-store" });
    }
  });

  api.post("/api/chat/transcribe", async (c) => {
    const apiKey = String(c.env.OPENAI_API_KEY ?? "").trim();
    if (!apiKey) return c.json({ ok: false, code: "CONFIGURATION_REQUIRED", missing: "OPENAI_API_KEY" }, 503);

    const form = await c.req.raw.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) return c.json({ ok: false, code: "INVALID_AUDIO", message: "audio file is required" }, 400);
    if (file.size <= 0 || file.size > 10_000_000) return c.json({ ok: false, code: "AUDIO_TOO_LARGE", max_bytes: 10_000_000 }, 413);

    const outbound = new FormData();
    outbound.set("file", file, file.name || "voice.webm");
    outbound.set("model", "gpt-4o-mini-transcribe");
    outbound.set("response_format", "json");

    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: outbound,
    });
    const body = await response.json().catch(() => ({})) as { text?: string; error?: { message?: string; code?: string } };
    if (!response.ok || !body.text) {
      return c.json({
        ok: false,
        code: body.error?.code ? `OPENAI_${String(body.error.code).toUpperCase()}` : `OPENAI_HTTP_${response.status}`,
        message: clean(body.error?.message ?? "Transcription failed", 240),
      }, response.status >= 400 && response.status < 600 ? response.status as 400 : 502);
    }
    return c.json({ ok: true, text: body.text, model: "gpt-4o-mini-transcribe", billing: "OPENAI_API" }, 200, { "Cache-Control": "no-store" });
  });

  api.post("/api/tasks", async (c) => {
    const body = await c.req.json<TaskCreate>().catch(() => ({} as TaskCreate));
    const title = clean(body.title, 160);
    if (!title) return c.json({ ok: false, code: "INVALID_REQUEST", message: "title is required" }, 400);
    const priorityValue = Number(body.priority ?? 50);
    const priority = Number.isFinite(priorityValue) ? Math.max(0, Math.min(100, Math.floor(priorityValue))) : 50;
    const capability = clean(body.capability, 120);
    const source = clean(body.source, 240) || "ogenic-ai-app-v0.2";
    const taskId = makeId("task");
    const correlationId = makeId("corr");
    const eventId = makeId("evt");

    await c.env.DB!.prepare(
      "INSERT INTO agent_tasks(id, title, capability, status, priority, correlation_id, source_ref) VALUES (?, ?, ?, 'QUEUED', ?, ?, ?)",
    ).bind(taskId, title, capability || null, priority, correlationId, source).run();
    await c.env.DB!.prepare(
      "INSERT INTO agent_events(id, task_id, event_type, actor, correlation_id, external_ref) VALUES (?, ?, 'TASK_CREATED', 'ogenic-owner', ?, ?)",
    ).bind(eventId, taskId, correlationId, source).run();
    const task = await c.env.DB!.prepare(
      "SELECT id, title, capability, status, priority, claimed_by, source_ref, created_at, updated_at FROM agent_tasks WHERE id = ?",
    ).bind(taskId).first();
    return c.json({ ok: true, task }, 201);
  });

  return api;
}
