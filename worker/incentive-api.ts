import { Hono, type Context } from "hono";
import { readIncentiveSnapshot, type IncentiveD1 } from "./provider-incentives";

type Bindings = {
  DB?: IncentiveD1;
  OGENIC_OPS_KEY?: string;
};
type AppEnv = { Bindings: Bindings };

const api = new Hono<AppEnv>();

async function secureEqual(left: string, right: string) {
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(left)),
    crypto.subtle.digest("SHA-256", encoder.encode(right)),
  ]);
  const aa = new Uint8Array(a);
  const bb = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < aa.length; i += 1) diff |= aa[i] ^ bb[i];
  return diff === 0;
}

async function requireOpsAuth(c: Context<AppEnv>) {
  const configured = String(c.env.OGENIC_OPS_KEY ?? "");
  if (!configured) return c.json({ ok: false, code: "CONFIGURATION_REQUIRED", missing: "OGENIC_OPS_KEY" }, 503);
  const authorization = c.req.header("authorization") ?? "";
  const bearer = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  const headerKey = (c.req.header("x-ogenic-ops-key") ?? "").trim();
  const supplied = bearer || headerKey;
  if (!supplied || !(await secureEqual(supplied, configured))) {
    return c.json({ ok: false, code: "REAUTH_REQUIRED", provider: "ogenic_ops" }, 401);
  }
  return null;
}

api.get("/api/ops/incentives", async (c) => {
  const denied = await requireOpsAuth(c);
  if (denied) return denied;
  if (!c.env.DB) return c.json({ ok: false, code: "CONFIGURATION_REQUIRED", missing: "D1 binding DB" }, 503);
  return c.json(await readIncentiveSnapshot(c.env.DB));
});

export default api;
