import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const catalog = JSON.parse(await readFile(new URL("../docs/research/OGENIC_DISCOVERY_CATALOG.json", import.meta.url), "utf8"));
const taxonomy = JSON.parse(await readFile(new URL("../config/pstack-task-taxonomy.json", import.meta.url), "utf8"));
const brief = await readFile(new URL("../docs/research/OGENIC_DISCOVERY_INTAKE.md", import.meta.url), "utf8");
const circuitSource = await readFile(new URL("../docs/research/OGENIC_2A_CIRCUIT.mmd", import.meta.url), "utf8");
const circuitSvg = await readFile(new URL("../docs/research/OGENIC_2A_CIRCUIT.svg", import.meta.url), "utf8");

test("discovery catalog stays source-only and reuses canonical OGENIC memory", () => {
  assert.equal(catalog.schema_version, "OGENIC_DISCOVERY_CATALOG_V1");
  assert.equal(catalog.state, "SOURCE_ONLY_NOT_RUNTIME_INTEGRATED");
  assert.equal(catalog.canonical_repo, "Ogenicchocolate21debug/Build-Platform");
  assert.equal(catalog.canonical_memory, "owner-main / 1LSS_OWNER_MAIN");
  assert.equal(catalog.invariants.new_github_repository_created, false);
  assert.equal(catalog.invariants.new_memory_database_created, false);
  assert.equal(catalog.invariants.automatic_install_or_code_execution, false);
  assert.equal(catalog.invariants.runtime_integration_verified, false);
});

test("every discovery has a unique key, explicit decision, source state, and no runtime claim", () => {
  assert.ok(Array.isArray(catalog.items) && catalog.items.length > 0);
  const keys = catalog.items.map(item => item.canonical_id);
  assert.equal(new Set(keys).size, keys.length, "duplicate canonical_id detected");
  const allowedDisposition = new Set([
    "PATTERN_ONLY_ALREADY_REVIEWED",
    "PATTERN_STUDY_ONLY_NO_CODE_COPY",
    "PATTERN_ONLY_REUSE_EXISTING_PSTACK",
    "PATTERN_ONLY_SELECTIVE",
    "HOLD_UNTIL_CANONICAL_REPO_AND_LICENSE_VERIFIED",
    "PATTERN_ONLY_NO_NEW_MEMORY_STORE",
    "HOLD_FOR_OFFICIAL_URL",
    "HOLD_FOR_EXACT_REPOSITORY_URL"
  ]);
  for (const item of catalog.items) {
    assert.ok(item.canonical_id, "canonical_id required");
    assert.ok(item.display_name, "display_name required");
    assert.ok(item.source_state, "source_state required");
    assert.ok(allowedDisposition.has(item.disposition), "disposition must remain review-only until Owner approval");
    assert.equal(item.runtime_installed, false, item.canonical_id);
    assert.equal(item.runtime_verified, false, item.canonical_id);
    assert.ok(item.license && item.license.state, "license state must be explicit");
    if (item.canonical_url !== null) {
      assert.match(item.canonical_url, /^https:\/\//, "source URLs must use HTTPS");
    }
    if (!item.canonical_url || ["UNVERIFIED", "IDENTITY_AND_LICENSE_NOT_VERIFIED", "NOT_APPLICABLE_UNTIL_SOURCE_IDENTIFIED"].includes(item.license.state)) {
      assert.notEqual(item.disposition, "CODE_REUSE_APPROVED");
    }
  }
});

test("known GitHub repositories are not listed more than once under separate account discoveries", () => {
  const repos = catalog.items
    .filter(item => item.source_type === "github_repo")
    .map(item => item.canonical_id.toLowerCase());
  assert.equal(new Set(repos).size, repos.length, "duplicate GitHub repository key detected");
  for (const item of catalog.items.filter(item => item.source_type === "github_repo")) {
    assert.match(item.canonical_url, /^https:\/\/github\.com\//);
    assert.ok(Array.isArray(item.discovered_by) && item.discovered_by.length > 0);
  }
});

test("P-Stack references and task-category tags resolve to the pinned canonical taxonomy", () => {
  const byNumber = new Map(taxonomy.skills.map(skill => [skill.number, skill]));
  const refs = catalog.pstack_review.selected_skill_refs;
  assert.ok(refs.length > 0);
  assert.equal(new Set(refs.map(ref => ref.number)).size, refs.length);
  for (const ref of refs) {
    const canonical = byNumber.get(ref.number);
    assert.ok(canonical, `Pstack number ${ref.number} missing from canonical taxonomy`);
    assert.equal(canonical.id, ref.id, `Pstack ${ref.number} ID mismatch`);
  }
  const allowedCategories = new Set(Object.keys(taxonomy.task_categories));
  for (const item of catalog.items) {
    for (const category of item.pstack_task_categories) {
      assert.ok(allowedCategories.has(category), `unknown task category ${category} on ${item.canonical_id}`);
    }
  }
});

test("the same source can be found by both agents without creating duplicate records", () => {
  const allowedDedupStates = new Set([
    "SOURCE_URL_REQUIRED",
    "CANONICAL_REDIRECT_UNRESOLVED",
    "ALREADY_SHARED_AUDIT",
    "MERGED_FROM_SHARED_DISCOVERY"
  ]);
  for (const item of catalog.items) {
    assert.ok(allowedDedupStates.has(item.deduplication_state));
    assert.ok(Array.isArray(item.existing_oge_links), "link related OGE work instead of opening duplicates");
  }
});

test("the consolidated brief keeps the repository list names-only and carries WAVE delivery evidence", () => {
  for (const slug of [
    "engasnm111/lnwjud",
    "nashsu/llm_wiki",
    "qufei1993/skills-hub",
    "jokim1/karpathy-skills",
    "mattpocock/skills",
    "affaan-m/everything-claude-code",
    "thedotmack/claude-mem"
  ]) assert.ok(brief.includes(slug), `missing repository name: ${slug}`);

  for (const required of [
    "Native iOS build/App Store release",
    "NOT_VERIFIED",
    "US$99 per year",
    "OGE-123",
    "owner-main / 1LSS_OWNER_MAIN",
    "Pstack: 9,16,20,28,30,34,35,44",
    "HELLO_GT_FROM_GS",
    "runner_id=0",
    "Check-in / Check-out",
    "Yellow Stone"
  ]) assert.ok(brief.includes(required), `missing consolidated requirement: ${required}`);
});

test("the consolidated circuit includes a Mermaid source and explicit verification boundaries", () => {
  assert.match(circuitSource, /^flowchart TB/m);
  for (const status of ["BLOCKED", "NOT VERIFIED", "Owner approval", "1LSS"]) {
    assert.ok(circuitSource.includes(status), `Mermaid diagram missing ${status}`);
  }
  assert.match(circuitSvg, /<svg[\s\S]*<\/svg>/);
  for (const status of ["BLOCKED", "NOT VERIFIED", "OWNER APPROVAL", "1LSS"]) {
    assert.ok(circuitSvg.includes(status), `SVG diagram missing ${status}`);
  }
});
