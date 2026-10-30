// Pure file preparation: never deploy, fetch secrets, or connect to remote D1.
// Keep the build artifact directory so Wrangler's relative bundle paths still work.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";

const built = resolve("dist/ogenic_phase_vi_staging/wrangler.json");
if (!existsSync(built)) throw new Error("REPLICA_BUNDLE_MISSING_RUN_NPM_BUILD_FIRST");
const root = JSON.parse(readFileSync(resolve("wrangler.jsonc"), "utf8"));
const cfg = JSON.parse(readFileSync(built, "utf8"));
const sourceD1 = root.d1_databases?.find(row => row.binding === "DB");
assert.ok(sourceD1, "CANONICAL_D1_BINDING_MISSING");
assert.equal(root.name, "ogenic-phase-vi-staging");
assert.equal(root.main, "worker/entry-yellow-stone.ts");
assert.ok(cfg.main || cfg.assets, "COMPILED_WORKER_AND_ASSETS_MISSING");

cfg.name = "unifiend-replica-local";
delete cfg.routes;
delete cfg.route;
delete cfg.triggers;
delete cfg.workers_dev;
delete cfg.account_id;
delete cfg.env;
delete cfg.secrets;
delete cfg.secrets_store;
cfg.send_metrics = false;
cfg.observability = { enabled: false };
cfg.vars = {
  OGENIC_PHASE: "VI",
  OGENIC_RUNTIME: "cloudflare-replica",
  OGENIC_GITHUB_REPO: "Wave-Runner-2/Build-Platform",
  OGENIC_GITHUB_BRANCH: "Unified-on-Progress",
  OGENIC_GIT_SHA: process.env.GITHUB_SHA || "local",
  N8N_SELFHOST_BASE_URL: "http://127.0.0.1:65534"
};

const out = resolve("dist/ogenic_phase_vi_staging/replica.wrangler.json");
const migrationPath = relative(dirname(out), resolve("database/migrations"));
cfg.d1_databases = [{
  binding: "DB",
  database_name: "unifiend-replica-local",
  database_id: "00000000-0000-4000-8000-000000000091",
  migrations_dir: migrationPath,
  remote: false
}];
// In a future version bindings may add remote=true; never permit them in a
// local proof. Fail rather than silently contacting a real external service.
function ensureLocal(value, key = "") {
  if (!value || typeof value !== "object") return;
  for (const [field, nested] of Object.entries(value)) {
    if (field === "remote" && nested === true) throw new Error("REMOTE_BINDING_FORBIDDEN");
    if (/^(api[_-]?token|api[_-]?key|secret|password|credential)$/i.test(field))
      throw new Error("CREDENTIAL_FIELD_FORBIDDEN");
    ensureLocal(nested, field);
  }
}
ensureLocal(cfg);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(cfg, null, 2) + "\n");
console.log(JSON.stringify({
  ok:true, mode:"REPLICA_LOCAL_ONLY", config:"dist/ogenic_phase_vi_staging/replica.wrangler.json",
  binding:"DB", database_name:"unifiend-replica-local", remote_resources:false,
  staged_deployment:false, source_sha:process.env.GITHUB_SHA || "local"
}));
