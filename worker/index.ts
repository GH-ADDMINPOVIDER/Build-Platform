import { Hono } from "hono";
import providers from "../config/providers.json";
import capabilities from "../config/capabilities.json";

type D1Result<T = Record<string, unknown>> = { results?: T[]; success?: boolean };
type D1Prepared = {
  bind: (...values: unknown[]) => D1Prepared;
  all: <T = Record<string, unknown>>() => Promise<D1Result<T>>;
  first: <T = Record<string, unknown>>() => Promise<T | null>;
  run: () => Promise<unknown>;
};
type D1Like = { prepare: (query: string) => D1Prepared };

type Bindings = {
  DB?: D1Like;
  ASSETS: { fetch: (request: Request) => Promise<Response> };
  OGENIC_PHASE: string;
  OGENIC_RUNTIME: string;
};

const app = new Hono<{ Bindings: Bindings }>();

app.get("/api/health", (c) =>
  c.json({
    ok: true,
    phase: c.env.OGENIC_PHASE ?? "VI",
    runtime: c.env.OGENIC_RUNTIME ?? "cloudflare",
    database: c.env.DB ? "BOUND" : "UNBOUND",
    providers: providers.providers.length,
  }),
);

app.get("/api/capabilities", (c) => c.json(capabilities));
app.get("/api/providers", (c) =>
  c.json({
    providers: providers.providers.map(({ secret_ref: _secretRef, ...safe }) => safe),
  }),
);

app.get("/api/state", async (c) => {
  if (!c.env.DB) {
    return c.json({ ok: false, code: "CONFIGURATION_REQUIRED", missing: "D1 binding DB" }, 503);
  }
  const meta = await c.env.DB.prepare("SELECT key, value FROM system_meta ORDER BY key").all();
  return c.json({ ok: true, meta: meta.results ?? [] });
});

app.post("/api/route", async (c) => {
  const body = await c.req.json<{ intent?: string }>().catch(() => ({}));
  const intent = String(body.intent ?? "").trim();
  if (!intent) return c.json({ ok: false, code: "INVALID_REQUEST", message: "intent is required" }, 400);

  const lowered = intent.toLowerCase();
  const provider = lowered.includes("repo") || lowered.includes("github") || lowered.includes("code")
    ? "github"
    : lowered.includes("drive") || lowered.includes("file") || lowered.includes("asset")
      ? "google_drive"
      : lowered.includes("task") || lowered.includes("linear") || lowered.includes("issue")
        ? "linear"
        : lowered.includes("deploy") || lowered.includes("cloudflare") || lowered.includes("worker")
          ? "cloudflare"
          : "control";

  return c.json({
    ok: true,
    intent,
    route: { provider, mode: "PLAN_ONLY_UNTIL_PROVIDER_AUTH_BOUND" },
  });
});

app.all("/api/*", (c) => c.json({ ok: false, code: "NOT_FOUND" }, 404));
app.all("*", (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
