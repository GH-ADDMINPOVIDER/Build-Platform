import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL("../" + path, import.meta.url), "utf8");
const config = JSON.parse(read("config/pstack-workflows.json"));

test("curated external workflows are available through the existing WAVE P-Stack picker", () => {
  const byId = new Map(config.workflows.map((workflow) => [workflow.id, workflow]));
  for (const id of ["diagram-design", "engineering-loop", "agent-harness-guardrails"]) {
    assert.ok(byId.has(id), id + " workflow missing");
    assert.equal(byId.get(id).source, "local_ogenic_adaptation");
    assert.match(byId.get(id).prompt, /USER TASK:/);
  }
  assert.equal(config.curated_extensions.integration_state, "LOCAL_OGENIC_ADAPTATIONS");
  assert.equal(config.curated_extensions.canonical_memory, "owner-main / 1LSS_OWNER_MAIN");
  assert.equal(config.curated_extensions.no_new_runtime_or_database, true);
});

test("diagram workflow reuses the canonical OGENIC map and does not create a second diagram source", () => {
  const workflow = config.workflows.find((item) => item.id === "diagram-design");
  assert.match(workflow.prompt, /OGE_SYSTEM_MAP\.mmd/);
  assert.match(workflow.prompt, /oge-system-edges\.json/);
  assert.match(workflow.prompt, /public\/architecture\/oge-system-map\.svg/);
  assert.match(read(".agents/skills/diagram-design/SKILL.md"), /mobile-readable horizontal pan/);
  assert.match(read("docs/architecture/EXTERNAL_SKILL_ADOPTIONS.md"), /instead of creating a competing map/);
});

test("engineering and agent guardrail skills preserve approval and evidence rules", () => {
  assert.match(read(".agents/skills/engineering-loop/SKILL.md"), /smallest surgical diff/);
  assert.match(read(".agents/skills/engineering-loop/SKILL.md"), /same SHA/);
  assert.match(read(".agents/skills/agent-harness-guardrails/SKILL.md"), /YELLOW \/ MA-OP/);
  assert.match(read(".agents/skills/agent-harness-guardrails/SKILL.md"), /Do not introduce a parallel memory store/);
  assert.match(read("docs/architecture/EXTERNAL_SKILL_ADOPTIONS.md"), /not added as a second memory backend/);
});

test("original numbered P-Stack source catalog stays separate from local extensions", () => {
  const sourceCatalog = JSON.parse(read("config/pstack-full-catalog.json"));
  const taxonomy = JSON.parse(read("config/pstack-task-taxonomy.json"));
  assert.equal(sourceCatalog.skill_count, 51);
  assert.equal(taxonomy.skills.length, 51);
  assert.equal(config.curated_extensions.no_new_runtime_or_database, true);
});
