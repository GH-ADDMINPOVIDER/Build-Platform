import assert from "node:assert/strict";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { resolve } from "node:path";
import { readdirSync } from "node:fs";

// Execute the built Worker in a disposable local runtime. No live credentials,
// remote database, provider requests or remote deployment are used by this check.
const builtRoot = resolve("dist/ogenic_phase_vi_staging");
const modulePaths = ["index.js", ...readdirSync(builtRoot, { recursive: true })
  .filter((path) => path.endsWith(".js") && path !== "index.js")];
const runtime = new Miniflare(convertV4MiniflareOptions({
  cf: false,
  telemetry: { enabled: false },
  workers: [{
    name: "unifiend-local-verification",
    modulesRoot: builtRoot,
    modules: modulePaths.map((path) => ({ type: "ESModule", path: resolve(builtRoot, path) })),
    compatibilityDate: "2026-09-06",
    compatibilityFlags: ["nodejs_compat"],
    d1Databases: ["DB"],
    assets: {
      directory: resolve("dist/client"),
      binding: "ASSETS",
      run_worker_first: ["/api/*"],
      routerConfig: { has_user_worker: true },
    },
  }],
}));

try {
  const session = await runtime.dispatchFetch("https://unifiend.test/api/session");
  const sessionBody = await session.text();
  assert.equal(session.status, 200, sessionBody);
  assert.equal(JSON.parse(sessionBody).authenticated, false);

  for (const path of ["/api/unifiend/command", "/api/unifiend/command/claim", "/api/unifiend/command/result"]) {
    const response = await runtime.dispatchFetch("https://unifiend.test" + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command: "Unifiend local verification", environment: "staging" }),
    });
    assert.equal(response.status, 401, path);
  }
  const status = await runtime.dispatchFetch("https://unifiend.test/api/unifiend/command/status?task_id=fixture");
  assert.equal(status.status, 401);

  const home = await runtime.dispatchFetch("https://unifiend.test/");
  assert.equal(home.status, 200);
  assert.match(await home.text(), /Unifiend/);
  for (const asset of ["unifiend-logo.webp", "unifiend-bg-mobile.webp", "unifiend-bg-desktop.webp"]) {
    const response = await runtime.dispatchFetch("https://unifiend.test/assets/" + asset);
    assert.equal(response.status, 200, asset);
    assert.match(response.headers.get("content-type"), /image\/webp/);
  }
  process.stdout.write("UNIFIEND_LOCAL_RUNTIME_PASS: session, four protected command routes, home and three image assets\n");
} finally {
  await runtime.dispose();
}
