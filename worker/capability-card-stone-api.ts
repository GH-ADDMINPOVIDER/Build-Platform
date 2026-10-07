import { Hono } from "hono";
import { hasOwnerOrOpsAccess, type AuthBindings } from "./app-auth";
import { publicCcsStatus } from "./capability-card-stone";

type Env = { Bindings: AuthBindings };

const api = new Hono<Env>();
const noStore = { "Cache-Control": "no-store" };

api.use("/api/ccs/*", async (c, next) => {
  if (!(await hasOwnerOrOpsAccess(c.req.raw, c.env))) {
    return c.json({ ok: false, code: "REAUTH_REQUIRED", role: "owner" }, 401, noStore);
  }
  await next();
});

api.get("/api/ccs/status", (c) => c.json(publicCcsStatus(), 200, noStore));

export function createCapabilityCardStoneApi() {
  return api;
}
