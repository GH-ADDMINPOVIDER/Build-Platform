export type DiscordAlertBindings = {
  DISCORD_ALERTS_WEBHOOK_URL?: string;
  DISCORD_WORKFLOW_WEBHOOK_URL?: string;
  DISCORD_RUNTIME_WEBHOOK_URL?: string;
  DISCORD_STATUS_WEBHOOK_URL?: string;
};

export type DiscordAlertKind = "SESSION_LOST" | "WORKFLOW_FAILURE" | "RUNTIME_ERROR" | "RECOVERY";

type AlertContext = { waitUntil?: (promise: Promise<unknown>) => void };
type Incident = { key: string; kind: Exclude<DiscordAlertKind, "RECOVERY">; at: number; code: string };
type AlertEvent = {
  kind: DiscordAlertKind;
  title: string;
  code: string;
  route: string;
  status: number;
  incidentId: string;
  color: number;
  timestamp: string;
};

const DEDUPE_WINDOW_MS = 5 * 60 * 1000;
const MAX_DEDUPE_KEYS = 500;
const recent = new Map<string, number>();
const activeIncidents = new Map<string, Incident>();

const COLORS: Record<DiscordAlertKind, number> = {
  SESSION_LOST: 0xed4245,
  WORKFLOW_FAILURE: 0xe67e22,
  RUNTIME_ERROR: 0x9b59b6,
  RECOVERY: 0x2ecc71,
};

function webhookFor(env: DiscordAlertBindings, kind: DiscordAlertKind) {
  if (kind === "WORKFLOW_FAILURE") return env.DISCORD_WORKFLOW_WEBHOOK_URL || env.DISCORD_ALERTS_WEBHOOK_URL;
  if (kind === "RUNTIME_ERROR") return env.DISCORD_RUNTIME_WEBHOOK_URL || env.DISCORD_ALERTS_WEBHOOK_URL;
  if (kind === "RECOVERY") return env.DISCORD_STATUS_WEBHOOK_URL || env.DISCORD_ALERTS_WEBHOOK_URL;
  return env.DISCORD_STATUS_WEBHOOK_URL || env.DISCORD_ALERTS_WEBHOOK_URL;
}

function safeWebhook(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !["discord.com", "discordapp.com"].includes(url.hostname)) return null;
    if (!url.pathname.startsWith("/api/webhooks/")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function clip(value: unknown, max = 300) {
  return String(value ?? "").replace(/[\r\n\t]+/g, " ").trim().slice(0, max);
}

function postAlert(env: DiscordAlertBindings, event: AlertEvent) {
  const webhook = safeWebhook(webhookFor(env, event.kind));
  if (!webhook) return Promise.resolve();

  const dedupeKey = `${event.kind}:${event.route}:${event.code}:${event.incidentId}`;
  const now = Date.now();
  for (const [key, at] of recent) if (now - at >= DEDUPE_WINDOW_MS) recent.delete(key);
  if (recent.has(dedupeKey)) return Promise.resolve();
  recent.set(dedupeKey, now);
  if (recent.size > MAX_DEDUPE_KEYS) recent.delete(recent.keys().next().value as string);

  const emoji = event.kind === "SESSION_LOST" ? "🔴" : event.kind === "WORKFLOW_FAILURE" ? "🟠" : event.kind === "RUNTIME_ERROR" ? "🟣" : "🟢";
  const payload = {
    embeds: [{
      title: `${emoji} ${event.title}`.slice(0, 256),
      color: event.color,
      timestamp: event.timestamp,
      fields: [
        { name: "Event", value: event.kind, inline: true },
        { name: "HTTP", value: String(event.status), inline: true },
        { name: "Code", value: clip(event.code, 120) || "UNKNOWN", inline: true },
        { name: "Route", value: clip(event.route, 180) || "/", inline: false },
        { name: "Incident", value: clip(event.incidentId, 120), inline: false },
      ],
      footer: { text: "OGENIC / WAVE • redacted operational alert" },
    }],
    allowed_mentions: { parse: [] },
  };

  return fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(3000),
  }).then((response) => {
    if (!response.ok) throw new Error("DISCORD_ALERT_DELIVERY_FAILED");
  }).catch(() => {
    recent.delete(dedupeKey);
  });
}

function schedule(env: DiscordAlertBindings, event: AlertEvent, context?: AlertContext) {
  const task = postAlert(env, event);
  if (typeof context?.waitUntil === "function") context.waitUntil(task);
  else void task;
}

function event(kind: DiscordAlertKind, route: string, status: number, code: string, incidentId: string): AlertEvent {
  const title = kind === "SESSION_LOST"
    ? "Session lost / re-auth required"
    : kind === "WORKFLOW_FAILURE"
      ? "Workflow failure"
      : kind === "RUNTIME_ERROR"
        ? "Runtime / API error"
        : "Incident recovered";
  return {
    kind,
    title,
    code: clip(code, 120) || "UNKNOWN",
    route: clip(route, 180) || "/",
    status,
    incidentId: clip(incidentId, 120) || `incident-${Date.now()}`,
    color: COLORS[kind],
    timestamp: new Date().toISOString(),
  };
}

/** Inspect only response metadata; never forwards prompts, request bodies, cookies, or credentials. */
export function observeDiscordResponse(
  env: DiscordAlertBindings,
  request: Request,
  response: Response,
  context?: AlertContext,
) {
  const route = new URL(request.url).pathname;
  const bodyPromise = response.clone().json().catch(() => ({} as Record<string, unknown>));
  const task = bodyPromise.then((raw) => {
    const body = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
    const code = clip(body.code ?? body.error ?? body.error_code ?? "UNKNOWN", 120);
    const run = body.run && typeof body.run === "object" ? body.run as Record<string, unknown> : {};
    const failedRun = ["failed", "blocked"].includes(String(run.status ?? body.status ?? "").toLowerCase());
    const workflowFailure = failedRun || code.includes("WORKFLOW") || code === "CHAT_RUN_FAILED" || code === "ADAPTER_EXCEPTION";
    const sessionLost = response.status === 401 && ["REAUTH_REQUIRED", "OWNER_AUTH_REQUIRED", "MCP_AUTH_REQUIRED"].includes(code);
    const kind: Exclude<DiscordAlertKind, "RECOVERY"> | null = sessionLost
      ? "SESSION_LOST"
      : workflowFailure
        ? "WORKFLOW_FAILURE"
        : response.status >= 500
          ? "RUNTIME_ERROR"
          : null;

    if (kind) {
      const key = `${kind}:${route}:${code}`;
      const now = Date.now();
      const previous = activeIncidents.get(key);
      if (!previous || now - previous.at >= DEDUPE_WINDOW_MS) {
        const incidentId = clip(request.headers.get("x-request-id") || request.headers.get("idempotency-key") || key, 120);
        activeIncidents.set(key, { key, kind, at: now, code });
        schedule(env, event(kind, route, response.status, code, incidentId), context);
      }
      return;
    }

    if (!response.ok || response.status === 202 || code === "CHAT_RUN_PENDING") return;
    for (const [key, incident] of activeIncidents) {
      if (!key.startsWith(`${incident.kind}:${route}:`)) continue;
      activeIncidents.delete(key);
      const incidentId = clip(request.headers.get("x-request-id") || key, 120);
      schedule(env, event("RECOVERY", route, response.status, `RECOVERED:${incident.code}`, incidentId), context);
    }
  });
  if (typeof context?.waitUntil === "function") context.waitUntil(task);
  else void task;
}

export const discordAlertColors = COLORS;
