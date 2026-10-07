import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL("../" + path, import.meta.url), "utf8");
const placement = JSON.parse(read("config/n8n-oge-placement.json"));
const api = read("worker/n8n-migration-api.ts");
const lab = read("src/MaopLab.tsx");
const providers = JSON.parse(read("config/providers.json"));
const reconcile = read("database/migrations/0015_n8n_execution_fabric_reconcile.sql");

const workflowFiles = [
  ["deploy/n8n-selfhost/workflows/ogenic-oge62-flow-preaudit-v1.sanitized.json", 5],
  ["deploy/n8n-selfhost/workflows/ogenic-evidence-normalizer-v1.sanitized.json", 4],
  ["deploy/n8n-selfhost/workflows/ogenic-task-router-v1.sanitized.json", 4],
  ["deploy/n8n-selfhost/workflows/ogenic-violet-pipeline-orchestrator-v1.sanitized.json", 4],
];

test("OGE placement keeps MA-OP/Yellow authoritative and n8n as execution fabric", () => {
  assert.equal(placement.schema_version, "OGE_N8N_PLACEMENT_V1");
  assert.equal(placement.canonical.control_plane, "MAOP_YELLOW");
  assert.equal(placement.canonical.verification, "RUBY_STONE");
  assert.equal(placement.canonical.retention, "GREEN_1LSS");
  assert.equal(placement.canonical.n8n_role, "WORKFLOW_EXECUTION_FABRIC_NOT_CONTROL_PLANE");
  assert.ok(placement.rules.includes("WRITE_EXECUTE_DANGEROUS_REQUIRES_YELLOW_APPROVAL"));
});

test("workflow-native OGE lanes are placed in n8n while ingress/provider authority stays direct", () => {
  const byOge = new Map(placement.placements.map((row) => [row.oge, row]));
  assert.equal(byOge.get("OGE-62")?.decision, "N8N_PRIMARY_ORCHESTRATION");
  assert.equal(byOge.get("OGE-57")?.decision, "N8N_SUPPORTING");
  assert.equal(byOge.get("OGE-27")?.decision, "N8N_POSTRUN_ONLY");
  assert.equal(byOge.get("OGE-28")?.decision, "N8N_POSTRUN_ONLY");
  assert.equal(byOge.get("OGE-14")?.decision, "CLOUDFLARE_INGRESS_KEEP");
  assert.equal(byOge.get("OGE-58")?.decision, "DIRECT_PROVIDER_KEEP");
  assert.equal(byOge.get("OGE-59")?.decision, "DIRECT_PROVIDER_KEEP");
  assert.equal(byOge.get("OGE-60")?.decision, "DIRECT_PROVIDER_KEEP");
  assert.equal(byOge.get("OGE-37")?.decision, "N8N_ORCHESTRATION_SUPPORT");
  assert.equal(byOge.get("OGE-39")?.decision, "N8N_PIPELINE_SUPPORT");
  assert.equal(byOge.get("OGE-42")?.decision, "N8N_PIPELINE_SUPPORT");
  assert.equal(byOge.get("OGE-47")?.decision, "N8N_PARALLEL_SUPPORT");
  assert.equal(byOge.get("OGE-48")?.decision, "N8N_PIPELINE_SUPPORT");
  assert.equal(byOge.get("OGE-55")?.decision, "MAOP_RUBY_KEEP");
  assert.equal(byOge.get("OGE-56")?.decision, "MAOP_YELLOW_KEEP");
});

test("OGE execution-fabric modules are sanitized and inactive by default", () => {
  for (const [path, expectedNodes] of workflowFiles) {
    const workflow = JSON.parse(read(path));
    assert.equal(workflow.active, false, path);
    assert.equal(workflow.nodes.length, expectedNodes, path);
    assert.ok(workflow.nodes.some((node) => node.type === "n8n-nodes-base.executeWorkflowTrigger"), path);
    assert.ok(workflow.nodes.every((node) => !node.credentials), path);
    assert.ok(workflow.nodes.every((node) => !node.webhookId), path);
    const serialized = JSON.stringify(workflow);
    assert.doesNotMatch(serialized, /authorization\s*[:=]|cookie\s*[:=]|private[_-]?key\s*[:=]/i, path);
  }
});

test("OGE-62 n8n module is pre-audit only and cannot become commit authority", () => {
  const workflow = JSON.parse(read("deploy/n8n-selfhost/workflows/ogenic-oge62-flow-preaudit-v1.sanitized.json"));
  const code = workflow.nodes.map((node) => String(node.parameters?.jsCode ?? "")).join("\n");
  assert.match(code, /GITHUB_ACTIONS_DETERMINISTIC_AUDIT/);
  assert.match(code, /commit_eligible:false/);
  assert.match(code, /yellow:'FINAL_EXECUTION_AND_COMMIT_GATE'/);
  assert.match(code, /green:'FINAL_DONE_RETENTION_ONLY'/);
});

test("Violet n8n module prepares bounded pipelines but cannot bypass Yellow or Ruby", () => {
  const workflow = JSON.parse(read("deploy/n8n-selfhost/workflows/ogenic-violet-pipeline-orchestrator-v1.sanitized.json"));
  const code = workflow.nodes.map((node) => String(node.parameters?.jsCode ?? "")).join("\n");
  assert.match(code, /YELLOW_AUTHORIZATION_REQUIRED/);
  assert.match(code, /NO_HIDDEN_RETRY/);
  assert.match(code, /ruby_verification_required:true/);
  assert.match(code, /green_retention_allowed:false/);
  assert.match(code, /yellow:'EXECUTION_AUTHORITY'/);
});

test("verified self-host n8n is active in provider metadata without schema changes", () => {
  const n8n = providers.providers.find((row) => row.id === "n8n");
  assert.equal(n8n?.role, "workflow_execution_fabric");
  assert.equal(n8n?.status, "active");
  assert.equal(n8n?.auth, "api_key");
  assert.match(reconcile, /'n8n-staging'/);
  assert.match(reconcile, /'workflow_run'/);
  assert.match(reconcile, /'verified'/);
  assert.match(reconcile, /workflow_execution_auto_allowed/);
  assert.doesNotMatch(reconcile, /\b(?:CREATE|ALTER|DROP)\s+(?:TABLE|INDEX|TRIGGER|VIEW)\b/i);
});

test("Yellow keeps n8n workflow_run approval-gated as EXECUTE", () => {
  const execution = read("worker/capability-execution-api.ts");
  const migration = read("database/migrations/0002_canonical_operating_state.sql");
  assert.match(migration, /\('workflow_run','execution','EXECUTE'/);
  assert.match(execution, /descriptor\.permission_class !== "READ"/);
  assert.match(execution, /HUMAN_APPROVAL_REQUIRED/);
});

test("MA-OP Web Lab exposes placement and self-host inventory without enabling execution", () => {
  assert.match(api, /\/api\/n8n\/migration\/placement/);
  assert.match(api, /N8N_OGE_PLACEMENT_V1/);
  assert.match(lab, /\/api\/n8n\/migration\/placement/);
  assert.match(lab, /OGE placement/);
  assert.match(api, /workflow_execution_allowed: false/);
});
