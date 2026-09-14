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

type DirectChatBody = { prompt?: unknown; attachment_ids?: unknown };
type ChatRow = { role: string; content: string };
type AttachmentPayload = { filename: string; mime_type: string; data_base64: string };
type ResponsesBody = {
  output?: Array<{ content?: Array<{ type?: string; text?: string; refusal?: string }> }>;
  error?: { code?: string; message?: string } | null;
  usage?: { total_tokens?: number } | null;
};

const SAME_MIND_CONVERSATION_ID = "owner-main";

function clean(value: unknown, max: number) {
  return String(value ?? "").trim().slice(0, max);
}

function makeId(prefix: string) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function componentStatus(components: OpenAIStatusSummary["components"], name: string) {
  return components?.find((component) => component.name?.toLowerCase() === name.toLowerCase())?.status ?? "unknown";
}

function responseText(body: ResponsesBody) {
  const out: string[] = [];
  for (const item of body.output ?? []) {
    for (const part of item.content ?? []) {
      if (part.type === "output_text" && typeof part.text === "string") out.push(part.text);
      if (part.type === "refusal" && typeof part.refusal === "string") out.push(part.refusal);
    }
  }
  return out.join("\n").trim();
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
  api.use("/api/chat/api", requireProtectedAppRoute);

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
      }, 502);
    }
    return c.json({ ok: true, text: body.text, model: "gpt-4o-mini-transcribe", billing: "OPENAI_API" }, 200, { "Cache-Control": "no-store" });
  });

  api.post("/api/chat/api", async (c) => {
    const apiKey = String(c.env.OPENAI_API_KEY ?? "").trim();
    if (!apiKey) return c.json({ ok: false, code: "CONFIGURATION_REQUIRED", missing: "OPENAI_API_KEY" }, 503);
    const db = c.env.DB!;
    const body = await c.req.json<DirectChatBody>().catch(() => ({} as DirectChatBody));
    const prompt = clean(body.prompt, 7000);
    const attachmentIds = Array.isArray(body.attachment_ids)
      ? body.attachment_ids.map((value) => clean(value, 120)).filter(Boolean).slice(0, 4)
      : [];
    if (!prompt && !attachmentIds.length) return c.json({ ok: false, code: "INVALID_REQUEST", message: "prompt or attachment is required" }, 400);

    const historyResult = await db.prepare(
      `SELECT role, content FROM chat_messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 18`,
    ).bind(SAME_MIND_CONVERSATION_ID).all<ChatRow>();
    const history = [...(historyResult.results ?? [])].reverse()
      .map((row) => `${String(row.role).toUpperCase()}: ${clean(row.content, 900)}`)
      .join("\n");

    const content: Array<Record<string, unknown>> = [{
      type: "input_text",
      text: `You are OGENIC AI in paid OpenAI API mode. Preserve continuity using the recent website conversation below. Never claim access to the user's separate ChatGPT App conversation or memory. Reply in the user's language.\n\nRECENT WEBSITE CHAT:\n${history || "No prior website messages."}\n\nCURRENT OWNER MESSAGE:\n${prompt || "วิเคราะห์ไฟล์ที่แนบมา"}`,
    }];

    for (const id of attachmentIds) {
      const row = await db.prepare(
        `SELECT filename, mime_type, data_base64 FROM chat_attachments WHERE id = ? AND conversation_id = ?`,
      ).bind(id, SAME_MIND_CONVERSATION_ID).first<AttachmentPayload>();
      if (!row) return c.json({ ok: false, code: "ATTACHMENT_NOT_FOUND", id }, 404);
      if (row.mime_type.startsWith("image/")) {
        content.push({ type: "input_image", detail: "auto", image_url: `data:${row.mime_type};base64,${row.data_base64}` });
      } else {
        content.push({ type: "input_file", filename: row.filename, file_data: row.data_base64 });
      }
    }

    const userText = `${prompt || "วิเคราะห์ไฟล์ที่แนบมา"}${attachmentIds.length ? `\n\n[${attachmentIds.length} attachment(s)]` : ""}`;
    const now = Date.now();
    await db.prepare(
      `INSERT INTO chat_messages(id, conversation_id, role, content, model, run_id, created_at) VALUES (?, ?, 'user', ?, NULL, NULL, ?)`,
    ).bind(makeId("api_u"), SAME_MIND_CONVERSATION_ID, userText, now).run();

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": c.req.header("idempotency-key") ?? makeId("api"),
      },
      body: JSON.stringify({
        model: "gpt-5.6-sol",
        input: [{ role: "user", content }],
        max_output_tokens: 1500,
        store: false,
      }),
    });
    const result = await response.json().catch(() => ({})) as ResponsesBody;
    if (!response.ok) {
      return c.json({
        ok: false,
        code: result.error?.code ? `OPENAI_${String(result.error.code).toUpperCase()}` : `OPENAI_HTTP_${response.status}`,
        message: clean(result.error?.message ?? "OpenAI API request failed", 300),
      }, 502);
    }
    const text = responseText(result);
    if (!text) return c.json({ ok: false, code: "OPENAI_EMPTY_OUTPUT" }, 502);

    await db.prepare(
      `INSERT INTO chat_messages(id, conversation_id, role, content, model, run_id, created_at) VALUES (?, ?, 'assistant', ?, ?, NULL, ?)`,
    ).bind(makeId("api_a"), SAME_MIND_CONVERSATION_ID, text, "gpt-5.6-sol", Date.now()).run();

    return c.json({
      ok: true,
      text,
      model: "gpt-5.6-sol",
      mode: "api",
      incentive_pool: "api_billing",
      billing: "OPENAI_API",
      usage_tokens: Number(result.usage?.total_tokens ?? 0),
    }, 200, { "Cache-Control": "no-store" });
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
