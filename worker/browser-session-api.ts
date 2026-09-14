import puppeteer from "@cloudflare/puppeteer";
import { Hono, type Context, type Next } from "hono";
import { requireOwnerSession, type AuthBindings } from "./app-auth";

type BrowserSessionBindings = AuthBindings & {
  BROWSER?: any;
};
type BrowserSessionEnv = { Bindings: BrowserSessionBindings };
type StartBody = { url?: unknown };

const KEEP_ALIVE_MS = 600_000;
const LIVE_VIEW_TTL_MS = 3_600_000;

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

async function connectSession(binding: any, sessionId: string) {
  if (!sessionId || sessionId.length > 120) throw new Error("INVALID_SESSION_ID");
  return await (puppeteer as any).connect(binding, sessionId);
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
    session_reuse: true,
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
        recording: false,
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
        handoff: "HUMAN_IN_THE_LOOP_READY",
        secret_policy: "USER_TAKEOVER_FOR_LOGIN_MFA_CAPTCHA_SECRETS",
        keep_alive_ms: KEEP_ALIVE_MS,
      }, 201, { "Cache-Control": "no-store" });
    } catch (error) {
      try { browser?.disconnect?.(); } catch { /* noop */ }
      return c.json({
        ok: false,
        code: "BROWSER_SESSION_START_FAILED",
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
      const liveViewUrl = await liveViewForPage(page);
      const currentUrl = clean(page.url(), 2000);
      browser.disconnect();
      browser = null;
      return c.json({ ok: true, session_id: sessionId, live_view_url: liveViewUrl, current_url: currentUrl }, 200, { "Cache-Control": "no-store" });
    } catch (error) {
      try { browser?.disconnect?.(); } catch { /* noop */ }
      return c.json({
        ok: false,
        code: "BROWSER_SESSION_UNAVAILABLE",
        message: clean(error instanceof Error ? error.message : error, 200),
      }, 404, { "Cache-Control": "no-store" });
    }
  });

  api.delete("/api/browser-session/:id", async (c) => {
    const sessionId = clean(c.req.param("id"), 120);
    let browser: any = null;
    try {
      browser = await connectSession(c.env.BROWSER, sessionId);
      await browser.close();
      browser = null;
      return c.json({ ok: true, session_id: sessionId, state: "CLOSED" }, 200, { "Cache-Control": "no-store" });
    } catch (error) {
      try { browser?.disconnect?.(); } catch { /* noop */ }
      return c.json({
        ok: false,
        code: "BROWSER_SESSION_CLOSE_FAILED",
        message: clean(error instanceof Error ? error.message : error, 200),
      }, 409, { "Cache-Control": "no-store" });
    }
  });

  return api;
}

export type { BrowserSessionBindings };
