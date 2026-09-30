import puppeteer from "@cloudflare/puppeteer";
import { Hono, type Context, type Next } from "hono";
import { requireOwnerSession, type AuthBindings } from "./app-auth";

type D1Prepared = {
  bind: (...values: unknown[]) => D1Prepared;
  first: <T = Record<string, unknown>>() => Promise<T | null>;
  run: () => Promise<unknown>;
};
type D1Like = { prepare: (query: string) => D1Prepared };

type BrowserSessionBindings = AuthBindings & {
  BROWSER?: any;
  DB?: D1Like;
};
type BrowserSessionEnv = { Bindings: BrowserSessionBindings };
type StartBody = { url?: unknown };
type HandoffBody = { instructions?: unknown; timeout_ms?: unknown };

type HandoffState = {
  active?: boolean;
  handoffId?: string;
  durationMs?: number;
};

type BrowserControlState = "agent_control" | "human_control" | "resume_pending" | "completed" | "failed";

const KEEP_ALIVE_MS = 600_000;
const LIVE_VIEW_TTL_MS = 3_600_000;
const HANDOFF_TIMEOUT_MS = 600_000;
const ONE_LINE_ID = "owner-main";
const ONE_LINE_SESSION = "1LSS_OWNER_MAIN";

function clean(value: unknown, max: number) {
  return String(value ?? "").trim().slice(0, max);
}

function safeHttpUrl(value: unknown) {
  const raw = clean(value, 2000);
  if (!raw) return "about:blank";
  const url = new URL(raw);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("UNSUPPORTED_URL_SCHEME");
  const host = url.hostname.toLowerCase();
  if (
    host === "localhost" || host === "0.0.0.0" || host === "::1" ||
    /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  ) throw new Error("PRIVATE_NETWORK_URL_BLOCKED");
  return url.toString();
}

async function liveViewForPage(page: any) {
  const cdp = await page.createCDPSession();
  try {
    const result = await (cdp as any).send("Cloudflare.getLiveView", {
      mode: "tab",
      expiresInMs: LIVE_VIEW_TTL_MS,
    }) as { devtoolsFrontendUrl?: string };
    if (!result?.devtoolsFrontendUrl) throw new Error("LIVE_VIEW_URL_UNAVAILABLE");
    return result.devtoolsFrontendUrl;
  } finally {
    await cdp.detach().catch(() => undefined);
  }
}

async function handoffStateForPage(page: any): Promise<HandoffState> {
  const cdp = await page.createCDPSession();
  try {
    return await (cdp as any).send("Cloudflare.getHandoffState", {}) as HandoffState;
  } finally {
    await cdp.detach().catch(() => undefined);
  }
}

async function connectSession(binding: any, sessionId: string) {
  if (!sessionId || sessionId.length > 120) throw new Error("INVALID_SESSION_ID");
  return await (puppeteer as any).connect(binding, sessionId);
}

async function appendBrowserEvidence(
  db: D1Like | undefined,
  sessionId: string,
  state: BrowserControlState,
  currentUrl: string,
) {
  if (!db) return null;
  const idempotencyKey = `browser_recording:${sessionId}:closed`;
  const existing = await db.prepare(
    `SELECT sequence_no FROM chat_messages WHERE conversation_id = ? AND idempotency_key = ? LIMIT 1`,
  ).bind(ONE_LINE_ID, idempotencyKey).first<{ sequence_no: number }>();
  if (existing?.sequence_no) return { sequence: Number(existing.sequence_no), replayed: true };

  const now = Date.now();
  await db.prepare(
    `INSERT OR IGNORE INTO chat_conversations (id, owner_id, title, created_at, updated_at)
     VALUES (?, 'owner', 'OGENIC SAME MIND', ?, ?)`,
  ).bind(ONE_LINE_ID, now, now).run();
  const next = await db.prepare(
    `UPDATE chat_conversations SET last_sequence = last_sequence + 1, updated_at = ?
     WHERE id = ? RETURNING last_sequence`,
  ).bind(now, ONE_LINE_ID).first<{ last_sequence: number }>();
  if (!next || !Number.isFinite(Number(next.last_sequence))) throw new Error("1LSS_SEQUENCE_UNAVAILABLE");

  const sequence = Number(next.last_sequence);
  const safeUrl = clean(currentUrl, 1200);
  const content = [
    "BROWSER RUN SESSION CLOSED",
    `session=${sessionId}`,
    `state=${state}`,
    "recording=enabled",
    "recording_ref=cloudflare_browser_run",
    safeUrl ? `final_url=${safeUrl}` : "final_url=unknown",
  ].join(" · ");
  await db.prepare(
    `INSERT INTO chat_messages(
      id, conversation_id, role, content, model, run_id, created_at,
      sequence_no, source_surface, idempotency_key
    ) VALUES (?, ?, 'system', ?, NULL, ?, ?, ?, 'external-harness', ?)`,
  ).bind(`browser_evt_${crypto.randomUUID()}`, ONE_LINE_ID, content, sessionId, now, sequence, idempotencyKey).run();
  return { sequence, replayed: false };
}

export function createBrowserSessionApi() {
  const api = new Hono<BrowserSessionEnv>();

  const requireBrowser = async (c: Context<BrowserSessionEnv>, next: Next) => {
    const denied = await requireOwnerSession(c);
    if (denied) return denied;
    if (!c.env.BROWSER) {
      return c.json({ ok: false, code: "CONFIGURATION_REQUIRED", missing: "Browser Run binding BROWSER" }, 503);
    }
    await next();
  };

  api.use("/api/browser-session", requireBrowser);
  api.use("/api/browser-session/*", requireBrowser);

  api.get("/api/browser-session", async (c) => c.json({
    ok: true,
    state: "READY",
    provider: "cloudflare_browser_run",
    live_view: true,
    human_in_the_loop: true,
    structured_handoff: true,
    session_reuse: true,
    session_recording: true,
    recording_retention_days: 30,
    max_idle_keep_alive_ms: KEEP_ALIVE_MS,
    note: "Starting a browser session consumes Browser Run quota; this readiness check does not launch one.",
  }, 200, { "Cache-Control": "no-store" }));

  api.post("/api/browser-session", async (c) => {
    const body = await c.req.json<StartBody>().catch(() => ({} as StartBody));
    let targetUrl = "about:blank";
    try {
      targetUrl = safeHttpUrl(body.url);
    } catch (error) {
      return c.json({ ok: false, code: error instanceof Error ? error.message : "INVALID_URL" }, 400);
    }

    let browser: any = null;
    try {
      browser = await (puppeteer as any).launch(c.env.BROWSER, {
        keep_alive: KEEP_ALIVE_MS,
        recording: true,
      });
      const sessionId = browser.sessionId();
      const pages = await browser.pages();
      const page = pages[0] ?? await browser.newPage();
      await page.setViewport({ width: 1180, height: 820, deviceScaleFactor: 1 });
      if (targetUrl !== "about:blank") {
        await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 25_000 }).catch(() => undefined);
      }
      const liveViewUrl = await liveViewForPage(page);
      const currentUrl = clean(page.url(), 2000);
      browser.disconnect();
      browser = null;
      return c.json({
        ok: true,
        session_id: sessionId,
        live_view_url: liveViewUrl,
        current_url: currentUrl,
        mode: "cloudflare_browser_run",
        control_state: "agent_control" satisfies BrowserControlState,
        handoff: "HUMAN_IN_THE_LOOP_READY",
        recording: {
          enabled: true,
          availability: "AFTER_SESSION_CLOSE",
          provider_ref: `browser-run:recording:${sessionId}`,
          retention_days: 30,
        },
        secret_policy: "USER_TAKEOVER_FOR_LOGIN_MFA_CAPTCHA_SECRETS",
        keep_alive_ms: KEEP_ALIVE_MS,
      }, 201, { "Cache-Control": "no-store" });
    } catch (error) {
      try { browser?.disconnect?.(); } catch { /* noop */ }
      return c.json({
        ok: false,
        code: "BROWSER_SESSION_START_FAILED",
        control_state: "failed" satisfies BrowserControlState,
        message: clean(error instanceof Error ? error.message : error, 240),
      }, 502, { "Cache-Control": "no-store" });
    }
  });

  api.get("/api/browser-session/:id", async (c) => {
    const sessionId = clean(c.req.param("id"), 120);
    let browser: any = null;
    try {
      browser = await connectSession(c.env.BROWSER, sessionId);
      const pages = await browser.pages();
      const page = pages[0] ?? await browser.newPage();
      const [liveViewUrl, handoff] = await Promise.all([
        liveViewForPage(page),
        handoffStateForPage(page).catch((): HandoffState => ({ active: false })),
      ]);
      const currentUrl = clean(page.url(), 2000);
      const controlState: BrowserControlState = handoff.active ? "human_control" : "agent_control";
      browser.disconnect();
      browser = null;
      return c.json({
        ok: true,
        session_id: sessionId,
        live_view_url: liveViewUrl,
        current_url: currentUrl,
        control_state: controlState,
        handoff: {
          active: Boolean(handoff.active),
          handoff_id: clean(handoff.handoffId, 160) || null,
          duration_ms: Number(handoff.durationMs ?? 0),
        },
        recording: {
          enabled: true,
          availability: "AFTER_SESSION_CLOSE",
          provider_ref: `browser-run:recording:${sessionId}`,
        },
      }, 200, { "Cache-Control": "no-store" });
    } catch (error) {
      try { browser?.disconnect?.(); } catch { /* noop */ }
      return c.json({
        ok: false,
        code: "BROWSER_SESSION_UNAVAILABLE",
        control_state: "failed" satisfies BrowserControlState,
        message: clean(error instanceof Error ? error.message : error, 200),
      }, 404, { "Cache-Control": "no-store" });
    }
  });

  api.post("/api/browser-session/:id/handoff", async (c) => {
    const sessionId = clean(c.req.param("id"), 120);
    const body = await c.req.json<HandoffBody>().catch(() => ({} as HandoffBody));
    const instructions = clean(body.instructions, 1000) || "Complete the requested human-only step, then select Done or Failed in Live View.";
    const requestedTimeout = Number(body.timeout_ms ?? HANDOFF_TIMEOUT_MS);
    const timeout = Math.max(30_000, Math.min(HANDOFF_TIMEOUT_MS, Number.isFinite(requestedTimeout) ? requestedTimeout : HANDOFF_TIMEOUT_MS));
    let browser: any = null;
    let cdp: any = null;
    try {
      browser = await connectSession(c.env.BROWSER, sessionId);
      const pages = await browser.pages();
      const page = pages[0] ?? await browser.newPage();
      cdp = await page.createCDPSession();
      const before = await (cdp as any).send("Cloudflare.getHandoffState", {}) as HandoffState;
      if (before.active) {
        const liveViewUrl = await liveViewForPage(page);
        return c.json({
          ok: true,
          session_id: sessionId,
          control_state: "human_control" satisfies BrowserControlState,
          code: "HANDOFF_ALREADY_ACTIVE",
          live_view_url: liveViewUrl,
          handoff_id: clean(before.handoffId, 160) || null,
          duration_ms: Number(before.durationMs ?? 0),
        }, 200, { "Cache-Control": "no-store" });
      }
      const liveView = await (cdp as any).send("Cloudflare.getLiveView", {
        mode: "tab",
        expiresInMs: LIVE_VIEW_TTL_MS,
      }) as { devtoolsFrontendUrl?: string };
      if (!liveView.devtoolsFrontendUrl) throw new Error("LIVE_VIEW_URL_UNAVAILABLE");
      const handoff = await (cdp as any).send("Cloudflare.handoff", {
        instructions,
        timeout,
      }) as { handoffId?: string } | undefined;
      return c.json({
        ok: true,
        session_id: sessionId,
        control_state: "human_control" satisfies BrowserControlState,
        live_view_url: liveView.devtoolsFrontendUrl,
        handoff_id: clean(handoff?.handoffId, 160) || null,
        timeout_ms: timeout,
        resume_rule: "AGENT_MUST_WAIT_UNTIL_HANDOFF_IS_NOT_ACTIVE",
      }, 202, { "Cache-Control": "no-store" });
    } catch (error) {
      return c.json({
        ok: false,
        code: "BROWSER_HANDOFF_FAILED",
        control_state: "failed" satisfies BrowserControlState,
        message: clean(error instanceof Error ? error.message : error, 220),
      }, 409, { "Cache-Control": "no-store" });
    } finally {
      try { await cdp?.detach?.(); } catch { /* noop */ }
      try { browser?.disconnect?.(); } catch { /* noop */ }
    }
  });

  api.post("/api/browser-session/:id/resume", async (c) => {
    const sessionId = clean(c.req.param("id"), 120);
    let browser: any = null;
    try {
      browser = await connectSession(c.env.BROWSER, sessionId);
      const pages = await browser.pages();
      const page = pages[0] ?? await browser.newPage();
      const handoff = await handoffStateForPage(page);
      const currentUrl = clean(page.url(), 2000);
      if (handoff.active) {
        browser.disconnect();
        browser = null;
        return c.json({
          ok: false,
          code: "HUMAN_CONTROL_ACTIVE",
          session_id: sessionId,
          control_state: "human_control" satisfies BrowserControlState,
          handoff_id: clean(handoff.handoffId, 160) || null,
          current_url: currentUrl,
        }, 409, { "Cache-Control": "no-store" });
      }
      browser.disconnect();
      browser = null;
      return c.json({
        ok: true,
        session_id: sessionId,
        control_state: "resume_pending" satisfies BrowserControlState,
        current_url: currentUrl,
        resume_safe: true,
        note: "Structured handoff is no longer active; the supervising agent/runtime may resume from its checkpoint.",
      }, 200, { "Cache-Control": "no-store" });
    } catch (error) {
      try { browser?.disconnect?.(); } catch { /* noop */ }
      return c.json({
        ok: false,
        code: "BROWSER_RESUME_CHECK_FAILED",
        control_state: "failed" satisfies BrowserControlState,
        message: clean(error instanceof Error ? error.message : error, 220),
      }, 409, { "Cache-Control": "no-store" });
    }
  });

  api.delete("/api/browser-session/:id", async (c) => {
    const sessionId = clean(c.req.param("id"), 120);
    let browser: any = null;
    try {
      browser = await connectSession(c.env.BROWSER, sessionId);
      const pages = await browser.pages();
      const page = pages[0];
      const currentUrl = page ? clean(page.url(), 2000) : "";
      await browser.close();
      browser = null;
      const canonical = await appendBrowserEvidence(c.env.DB, sessionId, "completed", currentUrl).catch(() => null);
      return c.json({
        ok: true,
        session_id: sessionId,
        state: "CLOSED",
        control_state: "completed" satisfies BrowserControlState,
        recording: {
          enabled: true,
          status: "FINALIZING",
          provider_ref: `browser-run:recording:${sessionId}`,
          retrieval: "CLOUDFLARE_BROWSER_RUN_DASHBOARD_OR_SERVER_SIDE_ADAPTER",
          retention_days: 30,
          note: "Cloudflare finalizes recordings after session close; a brief not-found period is expected before replay is available.",
        },
        verification: {
          status: "partially_verified",
          evidence: "SESSION_CLOSED_RECORDING_REFERENCE_CREATED",
        },
        canonical: canonical ? {
          conversation_id: ONE_LINE_ID,
          session_line: ONE_LINE_SESSION,
          sequence: canonical.sequence,
          replayed: canonical.replayed,
        } : null,
      }, 200, { "Cache-Control": "no-store" });
    } catch (error) {
      try { browser?.disconnect?.(); } catch { /* noop */ }
      return c.json({
        ok: false,
        code: "BROWSER_SESSION_CLOSE_FAILED",
        control_state: "failed" satisfies BrowserControlState,
        message: clean(error instanceof Error ? error.message : error, 200),
      }, 409, { "Cache-Control": "no-store" });
    }
  });

  return api;
}

export type { BrowserSessionBindings };
