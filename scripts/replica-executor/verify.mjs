// Ephemeral Replica Runner — local-only functional proof, no remote calls.
import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const base = process.env.REPLICA_URL || "http://127.0.0.1:8787";
const configPath = "dist/ogenic_phase_vi_staging/replica.wrangler.json";
const cfg = JSON.parse(readFileSync(configPath, "utf8"));
const manifest = JSON.parse(readFileSync("infra/replica-executor/replica-manifest.json", "utf8"));
const report = {
  schema_version:"UNIFIEND_REPLICA_PROOF_V1",
  mode:"LOCAL_SIMULATION_NO_PAID_CALLS",
  source_sha:process.env.GITHUB_SHA || "local",
  target_parity:"0.9:1 (unverified until staging comparison)",
  certified_parity_ratio:null,
  workflow_dispatch_deploy_staging:false,
  local_db_only:true,
  real_cloudflare_deploy:false,
  provider_inference_calls:0,
  checks:{}
};
function mark(name, passed, detail) {
  report.checks[name] = { passed: Boolean(passed), detail: String(detail).slice(0,180) };
  if (!passed) throw new Error("REPLICA_CHECK_FAILED:" + name + ":" + detail);
}

let reachable = false;
for (let attempt = 0; attempt < 50; attempt += 1) {
  try {
    const response = await fetch(base + "/api/health", { signal:AbortSignal.timeout(2500) });
    if (response.status === 200) { reachable = true; break; }
  } catch {}
  await new Promise((resolve) => setTimeout(resolve, 1000));
}

try {
  mark("built_config",cfg.name === "unifiend-replica-local" && existsSync(configPath),cfg.name);
  mark("node_runtime",process.versions.node.split(".")[0] === "22",process.version);
  mark("isolated_d1",cfg.d1_databases?.length === 1 &&
    cfg.d1_databases[0].database_name === "unifiend-replica-local" &&
    cfg.d1_databases[0].remote === false &&
    cfg.d1_databases[0].database_id !== "b4ac3a33-df80-47cf-8e75-7574e025b87b","isolated DB binding");
  mark("authless_configuration",!cfg.routes && !cfg.triggers && !cfg.account_id &&
    !JSON.stringify(cfg.vars||{}).includes("n8n-staging-76b7.up.railway.app"),
    "no remote route or known third-party service");
  mark("local_database_migrated",process.env.REPLICA_DB_MIGRATED === "true","local migrations applied");
  mark("workerd_local_boot",reachable,"health responded via 127.0.0.1");
  const probes = [
    { id:"api_health",path:"/api/health",status:200,json:true },
    { id:"knowledge_health",path:"/api/knowledge-refinery/health",status:200,json:true },
    { id:"unauthorized_pageindex",path:"/api/pageindex/status",status:401,json:true },
    { id:"web_shell",path:"/",status:200,html:true },
    { id:"chat_shell",path:"/chat",status:200,html:true }
  ];
  for (const probe of probes) {
    const response = await fetch(base + probe.path, { signal:AbortSignal.timeout(6000) });
    const ct = response.headers.get("content-type") || "";
    const body = await response.text();
    const looksCorrect = probe.json ? ct.includes("json") : ct.includes("html") && body.includes('id="root"');
    mark(probe.id, response.status === probe.status && looksCorrect,
      "HTTP " + response.status + " content-type=" + ct.slice(0,70));
  }
  const deploySource = readFileSync(".github/workflows/provider-incentive-staging-deploy.yml","utf8");
  mark("staging_deploy_handoff",deploySource.includes("workflow_dispatch:") &&
    deploySource.includes("runs-on: [self-hosted, linux, x64, wave]") &&
    manifest.deployment_handoff.replica_may_dispatch === false,
    "existing self-hosted staging workflow identified; NOT dispatched");
  report.status = "LOCAL_PROOF_PASS";
} catch (error) {
  report.status = "LOCAL_PROOF_FAIL";
  report.error = String(error instanceof Error ? error.message : error).slice(0,200);
  process.exitCode = 1;
} finally {
  report.local_checks_passed = Object.values(report.checks).filter(x=>x.passed).length;
  report.local_checks_total = Object.keys(report.checks).length;
  writeFileSync("replica-evidence.json",JSON.stringify(report,null,2)+"\n");
  console.log(JSON.stringify({
    status:report.status,checks:report.local_checks_passed+"/"+report.local_checks_total,
    staging_deploy:false,certified_parity_ratio:report.certified_parity_ratio,
    error:report.error||null,evidence:"replica-evidence.json"
  }));
}
