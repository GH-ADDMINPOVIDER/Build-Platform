import { Hono } from "hono";
import { hasOwnerSession, type AuthBindings } from "./app-auth";
import { readCanonicalD1Context, type D1ContextDb } from "./d1-context";

type Bindings = AuthBindings & { DB?: D1ContextDb; MANUS_API_KEY?: string };
type Env = { Bindings: Bindings };
type ManusBody = { prompt?: unknown };
type ManusResponse = {
  ok?: boolean;
  request_id?: string;
  task_id?: string;
  task_title?: string;
  task_url?: string;
  share_url?: string;
  share_visibility?: string;
  error?: { code?: string; message?: string };
};

function clean(value: unknown, max: number) {
  return String(value ?? "").trim().slice(0, max);
}

export function createManusApi() {
  const api = new Hono<Env>();

  api.get("/api/manus/status", async (c) => {
    if (!(await hasOwnerSession(c.req.raw, c.env))) {
      return c.json({ ok: false, code: "REAUTH_REQUIRED", role: "owner" }, 401);
    }
    return c.json({
      ok: true,
      state: String(c.env.MANUS_API_KEY ?? "").trim() ? "BOUND" : "CONFIGURATION_REQUIRED",
      provider: "manus_api_v2",
      task_create: true,
      connectors: "MANUS_DEFAULTS_WHEN_AUTHORIZED",
      note: "Manus connectors must be authorized in Manus first. Secret values are never returned to the browser.",
    }, 200, { "Cache-Control": "no-store" });
  });

  api.post("/api/manus/task", async (c) => {
    if (!(await hasOwnerSession(c.req.raw, c.env))) {
      return c.json({ ok: false, code: "REAUTH_REQUIRED", role: "owner" }, 401);
    }
    const apiKey = String(c.env.MANUS_API_KEY ?? "").trim();
    if (!apiKey) return c.json({ ok: false, code: "CONFIGURATION_REQUIRED", missing: "MANUS_API_KEY" }, 503);
    const body = await c.req.json<ManusBody>().catch(() => ({} as ManusBody));
    const prompt = clean(body.prompt, 13_000);
    if (!prompt) return c.json({ ok: false, code: "INVALID_REQUEST", message: "prompt is required" }, 400);
    const d1Context = await readCanonicalD1Context(c.env.DB);
    if (d1Context.state !== "LIVE") {
      return c.json({ ok: false, code: "CANONICAL_CONTEXT_UNAVAILABLE", state: d1Context.state }, 503);
    }
    const canonicalContext = clean(d1Context.text, 4_000);
    const delegatedPrompt = `OGENIC SHARED DIRECTION — load this before executing the owner task. Preserve 1LSS continuity and do not create a separate source of truth.\n\nCANONICAL D1 CONTEXT:\n${canonicalContext}\n\nOWNER TASK:\n${prompt}`;

    const response = await fetch("https://api.manus.ai/v2/task.create", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-manus-api-key": apiKey,
      },
      body: JSON.stringify({
        message: {
          content: [{ type: "text", text: delegatedPrompt }],
        },
      }),
    });
    const result = await response.json().catch(() => ({})) as ManusResponse;
    if (!response.ok || !result?.ok || !result.task_id) {
      return c.json({
        ok: false,
        code: clean(result.error?.code || `MANUS_HTTP_${response.status}`, 120),
        message: clean(result.error?.message || "Manus task creation failed", 260),
      }, response.status >= 400 && response.status < 500 ? 400 : 502);
    }

    return c.json({
      ok: true,
      task_id: result.task_id,
      task_title: clean(result.task_title, 200),
      task_url: clean(result.task_url, 1000),
      share_visibility: clean(result.share_visibility || "private", 40),
      provider: "manus_api_v2",
    }, 201, { "Cache-Control": "no-store" });
  });

  return api;
}
