import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("frontend never embeds or stores OGENIC_OPS_KEY", async () => {
  const app = await read("src/App.tsx");
  assert.doesNotMatch(app, /OGENIC_OPS_KEY/);
  assert.doesNotMatch(app, /sessionStorage|localStorage/);
  assert.doesNotMatch(app, /Authorization:\s*`Bearer/);
  assert.match(app, /credentials: "same-origin"/);
});

test("owner login produces a hardened HTTP-only session cookie", async () => {
  const auth = await read("worker/app-auth.ts");
  assert.match(auth, /HttpOnly; Secure; SameSite=Strict/);
  assert.match(auth, /crypto\.subtle\.sign\("HMAC"/);
  assert.match(auth, /validSignedSession/);
});

test("flattened v0.2 dashboard, tools and tasks routes require owner session", async () => {
  const api = await read("worker/app-api.ts");
  assert.match(api, /api\.use\("\/api\/dashboard", requireProtectedAppRoute\)/);
  assert.match(api, /api\.use\("\/api\/tools", requireProtectedAppRoute\)/);
  assert.match(api, /api\.use\("\/api\/tasks", requireProtectedAppRoute\)/);
  assert.doesNotMatch(api, /api\.use\("\/api\/app\/\*"/);
});

test("live integrations exist only in server-side Worker adapters", async () => {
  const adapters = await read("worker/live-tools.ts");
  const app = await read("src/App.tsx");
  for (const binding of ["GITHUB_TOKEN", "LINEAR_API_KEY", "N8N_API_KEY"]) {
    assert.match(adapters, new RegExp(binding));
    assert.doesNotMatch(app, new RegExp(binding));
  }
  assert.match(adapters, /api\.github\.com/);
  assert.match(adapters, /api\.linear\.app/);
  assert.match(adapters, /\/api\/v1\/workflows/);
});

test("deployment remains locked to the staging feature branch", async () => {
  const workflow = await read(".github/workflows/provider-incentive-staging-deploy.yml");
  const wrangler = await read("wrangler.jsonc");
  assert.match(workflow, /branches: \[phase-vi-provider-incentive-metering\]/);
  assert.match(workflow, /WORKER_NAME: ogenic-phase-vi-staging/);
  assert.match(workflow, /D1_DATABASE_NAME: ogenic-phase-vi-staging/);
  assert.match(wrangler, /phase-vi-provider-incentive-metering/);
  assert.doesNotMatch(workflow, /wrangler deploy[^\n]*--env prod/);
});
