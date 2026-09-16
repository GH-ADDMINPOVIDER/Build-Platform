import puppeteer from "@cloudflare/puppeteer";
import { Hono, type Context, type Next } from "hono";
import { requireOwnerSession, type AuthBindings } from "./app-auth";

export type LiveDoorBindings = AuthBindings & { BROWSER?: any };
type Env = { Bindings: LiveDoorBindings };
type StartBody = { url?: unknown; goal?: unknown };
type Candidate = { text: string; x: number; y: number; disabled: boolean };
type Scan = { gate: string | null; consent: boolean; candidates: Candidate[] };

const KEEP_ALIVE_MS = 600_000;
const LIVE_VIEW_TTL_MS = 3_600_000;

function clean(value: unknown, max: number) { return String(value ?? "").trim().slice(0, max); }
function safeHttpUrl(value: unknown) {
  const raw = clean(value, 2000);
  if (!raw) throw new Error("URL_REQUIRED");
  const url = new URL(raw);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("UNSUPPORTED_URL_SCHEME");
  const host = url.hostname.toLowerCase();
  if (
    host === "localhost" || host === "0.0.0.0" || host === "::1" || /^127\./.test(host) || /^10\./.test(host) ||
    /^192\.168\./.test(host) || /^169\.254\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  ) throw new Error("PRIVATE_NETWORK_URL_BLOCKED");
  return url.toString();
}
async function liveViewForPage(page: any) {
  const cdp = await page.createCDPSession();
  try {
    const result = await (cdp as any).send("Cloudflare.getLiveView", { mode: "tab", expiresInMs: LIVE_VIEW_TTL_MS }) as { devtoolsFrontendUrl?: string };
    if (!result?.devtoolsFrontendUrl) throw new Error("LIVE_VIEW_URL_UNAVAILABLE");
    return result.devtoolsFrontendUrl;
  } finally { await cdp.detach().catch(() => undefined); }
}
async function sleep(ms: number) { await new Promise((resolve) => setTimeout(resolve, ms)); }

async function scan(page: any): Promise<Scan> {
  return await page.evaluate(() => {
    const doc = document;
    const visible = (node: Element) => {
      const el = node as HTMLElement;
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.visibility !== "hidden" && style.display !== "none" && rect.width > 4 && rect.height > 4;
    };
    const secretSelectors = [
      'input[type="password"]',
      'input[autocomplete="one-time-code"]',
      'input[name*="otp" i]',
      'input[id*="otp" i]',
      'input[name*="code" i][inputmode="numeric"]',
      'input[name*="verification" i]',
    ];
    for (const selector of secretSelectors) {
      const el = doc.querySelector(selector);
      if (el && visible(el)) return { gate: selector, consent: false, candidates: [] };
    }
    const body = (doc.body?.innerText || "").toLowerCase().slice(0, 12000);
    if (doc.querySelector('iframe[src*="captcha" i], iframe[title*="captcha" i], [class*="captcha" i]')) {
      return { gate: "captcha", consent: false, candidates: [] };
    }
    if (/\b(two[- ]factor|2fa|verification code|security code|one[- ]time code|passkey|authenticator code|mfa)\b/i.test(body)) {
      return { gate: "verification", consent: false, candidates: [] };
    }
    const consent = /\b(authorize|allow access|grant access|approve access|consent)\b/i.test(body);
    const nodes = Array.from(doc.querySelectorAll('a,button,[role="button"],input[type="submit"],input[type="button"]'));
    const candidates = nodes.filter(visible).slice(0, 100).map((node) => {
      const el = node as HTMLElement;
      const rect = el.getBoundingClientRect();
      const input = node as HTMLInputElement;
      const text = ((el.innerText || input.value || node.getAttribute("aria-label") || node.getAttribute("title") || "") as string).replace(/\s+/g, " ").trim().slice(0, 180);
      return {
        text,
        x: Math.round(rect.left + rect.width / 2),
        y: Math.round(rect.top + rect.height / 2),
        disabled: Boolean((input as any).disabled) || node.getAttribute("aria-disabled") === "true",
      };
    }).filter((row) => row.text);
    return { gate: null, consent, candidates };
  }) as Scan;
}

function chooseCandidate(rows: Candidate[], goal: string, currentUrl: string) {
  const lowerGoal = goal.toLowerCase();
  const providerHints = ["github", "google", "apple", "microsoft", "line", "facebook", "meta", "vercel", "shopify"].filter((name) => lowerGoal.includes(name));
  let winner: { row: Candidate; score: number } | null = null;
  for (const row of rows) {
    if (row.disabled) continue;
    const text = row.text.toLowerCase();
    if (/\b(delete|remove|purchase|buy|pay|checkout|send|publish|deploy|merge|transfer|withdraw|authorize|allow access|grant access|approve|confirm order|place order)\b/i.test(text)) continue;
    let score = 0;
    if (/continue with|sign in with|log in with|login with/i.test(text)) score += 70;
    if (/^sign in$|^log in$|^login$|sign into|log into/i.test(text)) score += 60;
    if (/account|use another account|choose account/i.test(text)) score += 18;
    if (/next/i.test(text) && /auth|login|signin|oauth/i.test(currentUrl)) score += 12;
    for (const hint of providerHints) if (text.includes(hint)) score += 55;
    if (score > (winner?.score ?? 0)) winner = { row, score };
  }
  return winner && winner.score >= 45 ? winner.row : null;
}

export function createLiveDoorApi() {
  const api = new Hono<Env>();
  const requireBrowser = async (c: Context<Env>, next: Next) => {
    const denied = await requireOwnerSession(c);
    if (denied) return denied;
    if (!c.env.BROWSER) return c.json({ ok: false, code: "CONFIGURATION_REQUIRED", missing: "Browser Run binding BROWSER" }, 503);
    await next();
  };
  api.use("/api/live-door", requireBrowser);

  api.post("/api/live-door", async (c) => {
    const body = await c.req.json<StartBody>().catch(() => ({} as StartBody));
    let target = "";
    try { target = safeHttpUrl(body.url); }
    catch (error) { return c.json({ ok: false, code: error instanceof Error ? error.message : "INVALID_URL" }, 400); }
    const goal = clean(body.goal, 2000);
    let browser: any = null;
    const steps: Array<{ action: string; label?: string; url?: string }> = [];
    try {
      browser = await (puppeteer as any).launch(c.env.BROWSER, { keep_alive: KEEP_ALIVE_MS, recording: false });
      const sessionId = browser.sessionId();
      const pages = await browser.pages();
      const page = pages[0] ?? await browser.newPage();
      await page.setViewport({ width: 1180, height: 820, deviceScaleFactor: 1 });
      await page.goto(target, { waitUntil: "domcontentloaded", timeout: 25_000 }).catch(() => undefined);
      steps.push({ action: "open", url: clean(page.url(), 1200) });

      let state = "MANUAL_REQUIRED";
      let gate: string | null = null;
      for (let round = 0; round < 6; round += 1) {
        const currentUrl = clean(page.url(), 2000);
        const found = await scan(page);
        if (found.gate) { state = "WAITING_HUMAN_SECRET"; gate = found.gate; break; }
        if (found.consent) { state = "WAITING_HUMAN_CONSENT"; gate = "consent"; break; }
        const candidate = chooseCandidate(found.candidates, goal, currentUrl);
        if (!candidate) { state = round === 0 ? "MANUAL_REQUIRED" : "READY_FOR_HUMAN"; break; }
        await page.mouse.click(candidate.x, candidate.y);
        steps.push({ action: "click", label: clean(candidate.text, 120), url: currentUrl });
        await Promise.race([
          page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 3500 }).catch(() => undefined),
          sleep(1200),
        ]);
      }
      const finalScan = await scan(page).catch(() => ({ gate: null, consent: false, candidates: [] } as Scan));
      if (finalScan.gate) { state = "WAITING_HUMAN_SECRET"; gate = finalScan.gate; }
      else if (finalScan.consent) { state = "WAITING_HUMAN_CONSENT"; gate = "consent"; }
      const liveViewUrl = await liveViewForPage(page);
      const currentUrl = clean(page.url(), 2000);
      browser.disconnect();
      browser = null;
      return c.json({
        ok: true,
        session_id: sessionId,
        state,
        gate,
        current_url: currentUrl,
        live_view_url: liveViewUrl,
        steps,
        route: "BROWSER_QUOTA_FIRST",
        openai_tokens_used: 0,
        secret_policy: "STOP_BEFORE_PASSWORD_OTP_CAPTCHA_CONSENT",
        keep_alive_ms: KEEP_ALIVE_MS,
      }, 201, { "Cache-Control": "no-store" });
    } catch (error) {
      try { browser?.disconnect?.(); } catch { /* noop */ }
      return c.json({ ok: false, code: "LIVE_DOOR_FAILED", message: clean(error instanceof Error ? error.message : error, 240) }, 502, { "Cache-Control": "no-store" });
    }
  });
  return api;
}
