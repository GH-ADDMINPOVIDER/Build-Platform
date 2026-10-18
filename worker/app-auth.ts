import { Hono, type Context } from "hono";

export type AuthBindings = {
  OGENIC_OPS_KEY?: string;
};

type AuthEnv = { Bindings: AuthBindings };

const COOKIE = "ogenic_owner_session";
const SESSION_SECONDS = 60 * 60 * 12;

function bytes(value: string) {
  return new TextEncoder().encode(value);
}

function base64UrlEncode(value: string) {
  let binary = "";
  for (const byte of bytes(value)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlBytes(value: ArrayBuffer) {
  let binary = "";
  for (const byte of new Uint8Array(value)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function hmac(value: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    bytes(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return base64UrlBytes(await crypto.subtle.sign("HMAC", key, bytes(value)));
}

async function secureEqual(left: string, right: string) {
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", bytes(left)),
    crypto.subtle.digest("SHA-256", bytes(right)),
  ]);
  const aa = new Uint8Array(a);
  const bb = new Uint8Array(b);
  let difference = aa.length ^ bb.length;
  for (let index = 0; index < Math.min(aa.length, bb.length); index += 1) {
    difference |= aa[index] ^ bb[index];
  }
  return difference === 0;
}

function cookieValue(request: Request, name: string) {
  const source = request.headers.get("cookie") ?? "";
  for (const item of source.split(";")) {
    const separator = item.indexOf("=");
    if (separator < 0) continue;
    if (item.slice(0, separator).trim() === name) return item.slice(separator + 1).trim();
  }
  return "";
}

function bearerValue(request: Request) {
  const value = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(value.trim());
  return match?.[1]?.trim() ?? "";
}

function nativeClient(request: Request) {
  return (request.headers.get("x-ogenic-client") ?? "").trim().toLowerCase() === "native";
}

async function issueSession(secret: string) {
  const payload = base64UrlEncode(JSON.stringify({
    sub: "ogenic-owner",
    role: "owner",
    exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS,
    nonce: crypto.randomUUID(),
  }));
  return `${payload}.${await hmac(payload, secret)}`;
}

async function validSignedToken(token: string, secret: string) {
  const separator = token.lastIndexOf(".");
  if (separator <= 0) return false;
  const payload = token.slice(0, separator);
  const signature = token.slice(separator + 1);
  if (!(await secureEqual(signature, await hmac(payload, secret)))) return false;
  try {
    const padded = payload.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(payload.length / 4) * 4, "=");
    const decoded = JSON.parse(atob(padded)) as { sub?: string; role?: string; exp?: number };
    return decoded.sub === "ogenic-owner" && decoded.role === "owner" && Number(decoded.exp) > Date.now() / 1000;
  } catch {
    return false;
  }
}

async function validSignedSession(request: Request, secret: string) {
  const token = bearerValue(request) || cookieValue(request, COOKIE);
  return Boolean(token && await validSignedToken(token, secret));
}

export async function hasOwnerSession(request: Request, env: AuthBindings) {
  const secret = String(env.OGENIC_OPS_KEY ?? "").trim();
  return Boolean(secret && await validSignedSession(request, secret));
}

export async function hasOpsAccess(request: Request, env: AuthBindings) {
  const configured = String(env.OGENIC_OPS_KEY ?? "").trim();
  const supplied = (request.headers.get("x-ogenic-ops-key") ?? "").trim();
  return Boolean(configured && supplied && await secureEqual(supplied, configured));
}

export async function hasOwnerOrOpsAccess(request: Request, env: AuthBindings) {
  if (await hasOwnerSession(request, env)) return true;
  return hasOpsAccess(request, env);
}

export async function requireOwnerSession(c: Context<AuthEnv>) {
  if (await hasOwnerSession(c.req.raw, c.env)) return null;
  return c.json({ ok: false, code: "REAUTH_REQUIRED", role: "owner" }, 401);
}

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin || nativeClient(request);
}

export function createAuthApi() {
  const api = new Hono<AuthEnv>();

  api.get("/api/session", async (c) => {
    const authenticated = await hasOwnerSession(c.req.raw, c.env);
    return c.json({
      ok: true,
      authenticated,
      user: authenticated ? { id: "ogenic-owner", role: "owner", label: "OGENIC Owner" } : null,
      method: authenticated ? (bearerValue(c.req.raw) ? "native_bearer" : "secure_cookie") : null,
    }, 200, { "Cache-Control": "no-store" });
  });

  api.post("/api/session", async (c) => {
    if (!sameOrigin(c.req.raw)) return c.json({ ok: false, code: "ORIGIN_DENIED" }, 403);
    const configured = String(c.env.OGENIC_OPS_KEY ?? "").trim();
    if (!configured) return c.json({ ok: false, code: "CONFIGURATION_REQUIRED", missing: "OGENIC_OPS_KEY" }, 503);
    const body = await c.req.json<{ owner_key?: unknown }>().catch(() => ({ owner_key: undefined }));
    const supplied = typeof body.owner_key === "string" ? body.owner_key.trim() : "";
    if (!supplied || !(await secureEqual(supplied, configured))) {
      return c.json({ ok: false, code: "REAUTH_REQUIRED" }, 401, { "Cache-Control": "no-store" });
    }
    const token = await issueSession(configured);
    const responseBody: Record<string, unknown> = {
      ok: true,
      authenticated: true,
      user: { id: "ogenic-owner", role: "owner", label: "OGENIC Owner" },
    };
    if (nativeClient(c.req.raw)) responseBody.session_token = token;
    return c.json(
      responseBody,
      200,
      {
        "Cache-Control": "no-store",
        "Set-Cookie": `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_SECONDS}`,
      },
    );
  });

  // Silent renewal is permitted only when a signed OWNER session already
  // exists. The owner key is never persisted, returned or requested here.
  // No renewal is possible after expiration or explicit sign-out.
  api.post("/api/session/refresh", async (c) => {
    if (!sameOrigin(c.req.raw)) return c.json({ ok: false, code: "ORIGIN_DENIED" }, 403);
    const configured = String(c.env.OGENIC_OPS_KEY ?? "").trim();
    if (!configured) return c.json({ ok: false, code: "CONFIGURATION_REQUIRED" }, 503);
    if (!(await hasOwnerSession(c.req.raw, c.env))) {
      return c.json({ ok: false, code: "REAUTH_REQUIRED" }, 401, { "Cache-Control": "no-store" });
    }
    const token = await issueSession(configured);
    const payload: Record<string, unknown> = { ok: true, authenticated: true, renewed: true };
    if (nativeClient(c.req.raw)) payload.session_token = token;
    return c.json(payload, 200, {
      "Cache-Control": "no-store",
      "Set-Cookie": `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_SECONDS}`,
    });
  });

  api.delete("/api/session", (c) => c.json(
    { ok: true, authenticated: false },
    200,
    {
      "Cache-Control": "no-store",
      "Set-Cookie": `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`,
    },
  ));

  return api;
}
