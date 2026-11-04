// OGE-99 — honest, reproducible Stone Runner parity evidence matrix.
// It summarizes ONLY artifacts created in this exact GitHub job/SHA, never certifies external internals.
// Does not read production data, call providers, issue approvals, or write canonical Green/1LSS.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const shaPattern = /^[a-f0-9]{40}$/;
const REPO = "GH-ADDMINPOVIDER/Build-Platform";
const BRANCH = "Unified-on-Progress";
const PASS = "PASS";
const FAIL = "FAIL";
const NOT_TESTED = "NOT_TESTED";
function domain(id, status, observation, limit) {
  return {id, status, observation, limit};
}

export function buildParityMatrix({replica, oneLine, restart, sha, repository, branch, runId}) {
  if (!shaPattern.test(sha || "") || repository !== REPO || branch !== BRANCH)
    throw Error("CANONICAL_SHA_CONTEXT_REQUIRED");
  for (const x of [replica, oneLine, restart]) {
    if (x?.source_sha !== sha) throw Error("PARITY_EVIDENCE_SHA_MISMATCH");
    if (x?.remote_d1_access === true || x?.real_cloudflare_deploy === true ||
      Number(x?.provider_inference_calls || x?.provider_calls || 0) !== 0)
      throw Error("PARITY_UNAPPROVED_EXTERNAL_SIDE_EFFECT");
  }
  if (replica?.local_db_only !== true || oneLine?.remote_d1_access !== false ||
    restart?.remote_d1_access !== false)
    throw Error("PARITY_LOCAL_ONLY_ATTESTATION_REQUIRED");
  const checks = [
    domain("same_bundle_local_workerd", replica.status === "LOCAL_PROOF_PASS" &&
      replica.local_checks_passed === 12 && replica.local_checks_total === 12 ? PASS : FAIL,
      `${replica.local_checks_passed}/${replica.local_checks_total} isolated local runtime checks`,
      "Local Workerd is not a Cloudflare edge location"),
    domain("disposable_d1_1lss", oneLine.status === "LOCAL_1LSS_PASS" &&
      oneLine.checks_passed === 13 && oneLine.checks_total === 13 ? PASS : FAIL,
      `${oneLine.checks_passed}/${oneLine.checks_total} local 1LSS checks`,
      "Synthetic local D1, not owner-authenticated remote canonical state"),
    domain("warm_restart_1lss_persistence", restart.status === "LOCAL_1LSS_RESTART_PASS" &&
      restart.checks_passed === 8 && restart.checks_total === 8 ? PASS : FAIL,
      `${restart.checks_passed}/${restart.checks_total} persistence/replay/auth checks`,
      "Worker restarted using the same disposable local --persist-to data directory"),
    domain("ten_public_staging_surface_contracts",
      replica.staging_comparison?.status === "SURFACE_TARGET_MET" &&
      replica.staging_comparison?.tests_total === 10 &&
      replica.staging_comparison?.tests_matched >= 9 &&
      replica.staging_comparison?.tests_matched <= 10 &&
      replica.staging_comparison?.surface_match_ratio >= 0.9 &&
      replica.staging_comparison?.reached_target === true &&
      replica.staging_comparison?.cases?.length === 10 &&
      replica.staging_comparison.cases.filter(row => row.match === true).length === replica.staging_comparison.tests_matched ? PASS : FAIL,
      `${replica.staging_comparison?.tests_matched ?? 0}/${replica.staging_comparison?.tests_total ?? 0} public route contracts`,
      "Only the declared 90% public route target is checked; mismatches remain visible and same-SHA staging deployment is unproven"),
    domain("live_authenticated_1lss_cross_surface", NOT_TESTED, "No owner-authenticated live D1 roundtrip", "Requires separate authorized runtime proof"),
    domain("ccs_lease_revoke_end_to_end", NOT_TESTED, "Static contracts are not an end-to-end authorization test", "R3 scoped consent and mutation policies apply"),
    domain("real_codex_agent_code_execution", NOT_TESTED, "No actual OGE-98 Agent task receipt tied to this SHA", "Synthetic runtime profile labels are not real Agents"),
    domain("independent_ruby_semantic_verdict", NOT_TESTED, "No SHA-aligned independent Ruby verdict", "GitHub deterministic tests alone are not semantic verification"),
    domain("same_sha_cloudflare_deployed_runtime", NOT_TESTED, "Public HTTP shape is not a deployed SHA attestation", "Requires a separately authorized fresh staging deploy/evidence"),
    domain("actual_provider_or_mcp_execution", NOT_TESTED, "No paid or real provider calls were made", "Third-party internals cannot be cloned"),
  ];
  const localFail = checks.slice(0,4).some(x=>x.status !== PASS);
  return {
    schema_version: "OGE99_DECLARED_PARITY_MATRIX_V1",
    source_sha: sha, repository, branch, run_id: String(runId||""),
    evidence: {
      local_bundle: "replica-evidence.json",
      local_1lss: "replica-1lss-evidence.json",
      local_restart: "replica-1lss-restart-evidence.json",
    },
    source_scope: "EXACT_GITHUB_SHA_LOCAL_SYNTHETIC_PLUS_PUBLIC_HTTP_ONLY",
    verified_domain_count: checks.filter(x=>x.status===PASS).length,
    not_tested_domain_count: checks.filter(x=>x.status===NOT_TESTED).length,
    checks,
    exclusions: ["physical Cloudflare Edge equivalence", "remote provider internals", "production state or data"],
    result: localFail ? "LOCAL_PARITY_EVIDENCE_FAILED" : "PARTIAL_PARITY_EVIDENCE_COMPLETE",
    full_operational_1_to_1_certified: false,
    green_canonical_promotion_authorized: false,
    ready_to_close_oge99: false,
    ready_to_close_stone_phase: false,
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const sha = process.env.GITHUB_SHA || "";
  const repo = process.env.GITHUB_REPOSITORY || "";
  const branch = process.env.GITHUB_REF_NAME || "";
  assert.equal(repo, REPO);
  assert.equal(branch, BRANCH);
  const data = name => JSON.parse(readFileSync(name,"utf8"));
  const report = buildParityMatrix({
    replica: data("replica-evidence.json"),
    oneLine: data("replica-1lss-evidence.json"),
    restart: data("replica-1lss-restart-evidence.json"),
    sha, repository: repo, branch, runId: process.env.GITHUB_RUN_ID
  });
  writeFileSync("oge99-declared-parity-matrix.json",JSON.stringify(report,null,2)+"\n");
  console.log(JSON.stringify({result:report.result,source_sha:report.source_sha,verified:report.verified_domain_count,
    not_tested:report.not_tested_domain_count,certified:report.full_operational_1_to_1_certified,
    artifact:"oge99-declared-parity-matrix.json"}));
  if (report.result !== "PARTIAL_PARITY_EVIDENCE_COMPLETE") process.exitCode = 1;
}
