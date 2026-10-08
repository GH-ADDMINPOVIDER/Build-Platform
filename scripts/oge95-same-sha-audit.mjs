// OGE-95: same-exact-SHA re-audit using existing OGE-62 deterministic clone/audit.
// Ten distinct local subprocesses on ONE CI machine; NOT ten hosts or ten LLM agents.
// Never commits, deploys, touches D1, uses provider credentials, or calls an LLM.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
export const REPO = "Ogenicchocolate21debug/Build-Platform";
export const BRANCH = "phase-vi-provider-incentive-metering";
const SHA40 = /^[a-f0-9]{40}$/i;
const PROFILES = ["linearcodex","codex","claude","codex","claude","linearcodex","codex","claude","codex","claude"];
const EXPECTED = PROFILES.map((profile, index) =>
  ({runtime_id: "runtime-"+String(index+1).padStart(2,"0"), profile}));

export function bindAuditToCheckedSha({ audit, claimedSha, checkedSha, repo, branch, results }) {
  if (!SHA40.test(claimedSha ?? "") || checkedSha !== claimedSha ||
      repo !== REPO || branch !== BRANCH) throw Error("CANONICAL_EXACT_SHA_ATTESTATION_FAILED");
  if (audit?.schema !== "OGE62_FLOW_AUDIT_V1" || audit.ok !== true ||
      audit.state !== "FINAL_DONE" || audit.commit_eligible !== true ||
      audit.expected_runtime_count !== 10 || audit.provisional_done_count !== 10 ||
      audit.final_done_count !== 10 || !audit.commit_manifest?.allowed ||
      !Array.isArray(audit.audit) || audit.audit.length !== 10 ||
      !Array.isArray(audit.errors) || audit.errors.length !== 0 ||
      !Array.isArray(results) || results.length !== 10)
    throw Error("DETERMINISTIC_TEN_RUNTIME_AUDIT_INVALID");
  for (const expected of EXPECTED) {
    const item = results.filter(x => x.runtime_id === expected.runtime_id);
    const audited = audit.audit.filter(x => x.runtime_id === expected.runtime_id);
    if (item.length !== 1 || audited.length !== 1 ||
        item[0].execution_profile !== expected.profile ||
        item[0].repository !== REPO || item[0].branch !== BRANCH ||
        item[0].provider_call_attempted !== false ||
        item[0].paid_call_performed !== false ||
        item[0].canonical_write_attempted !== false ||
        item[0].d1_schema_write_attempted !== false ||
        item[0].state !== "PROVISIONAL_DONE" || item[0].self_verify !== "PASS" ||
        audited[0].audit !== "PASS" || audited[0].next_state !== "FINAL_DONE" ||
        audited[0].evidence_digest !== item[0].evidence_digest)
      throw Error("TEN_RUNTIME_PROFILE_OR_RECEIPT_MISMATCH:" + expected.runtime_id);
  }
  if (new Set(results.map(x => x.task_fingerprint)).size !== 1)
    throw Error("TEN_RUNTIME_TASK_FINGERPRINT_MISMATCH");
  return {
    ...audit,
    source_sha: claimedSha,
    source_sha_attestation: {
      method: "CHECKED_OUT_GIT_HEAD_AND_GITHUB_SHA",
      exact_checkout_match: true,
      execution_mode: "SEQUENTIAL_TEN_PROCESS_REPLAY_ON_ONE_HOST",
      genuinely_parallel_runtime_jobs: false,
      independent_ai_provider_runs: false,
      audited_existing_oge62_clone_implementation: true,
      authorization_to_commit_or_deploy: false
    },
    commit_manifest: {
      ...audit.commit_manifest,
      // Existing OGE-62 eligibility is a test result, never side-effect approval.
      execution_approved: false
    }
  };
}
export function produceSameShaAudit({ env = process.env, executor = execFileSync,
  workspace = process.cwd(), outPath = "oge95-same-sha-audit.json" } = {}) {
  const claimedSha = env.GITHUB_SHA;
  if (!SHA40.test(claimedSha ?? "") || env.GITHUB_REF_NAME !== BRANCH ||
      env.GITHUB_REPOSITORY !== REPO) throw Error("CI_STAGING_CONTEXT_REQUIRED");
  const run = (cmd,args,opts={}) =>
    String(executor(cmd,args,{ cwd:workspace, encoding:"utf8",timeout:40000,maxBuffer:512*1024,...opts })).trim();
  const checkedSha = run("git",["rev-parse","HEAD"]);
  if (checkedSha !== claimedSha) throw Error("HEAD_MUST_MATCH_GITHUB_SHA");
  const temp = mkdtempSync(join(env.RUNNER_TEMP || tmpdir(),"oge95-sha-audit-"));
  const task = "OGE-95 bounded exact SHA ten-clone audit of "+claimedSha;
  const cloneEnv = {
    PATH: env.PATH || "/usr/bin:/bin", HOME: env.RUNNER_TEMP || "/tmp",
    GITHUB_SHA: claimedSha, GITHUB_REPOSITORY: REPO,
    GITHUB_REF_NAME: BRANCH, OGENIC_AGENT_TASK: task
  };
  try {
    const files = [];
    for (const e of EXPECTED) {
      const path=join(temp,e.runtime_id,"result.json");
      mkdirSync(dirname(path),{recursive:true});
      run(process.execPath,[
        "scripts/flow-runtime-clone.mjs",
        "--runtime="+e.runtime_id, "--profile="+e.profile,
        "--revision=1", "--output="+path
      ],{env:cloneEnv});
      files.push(path);
    }
    const generated=join(temp,"audit.json");
    run(process.execPath,[
      "scripts/audit-flow-runtime-results.mjs","--input="+temp,"--output="+generated
    ],{env:cloneEnv});
    const audit=JSON.parse(readFileSync(generated,"utf8"));
    const results=files.map(path=>JSON.parse(readFileSync(path,"utf8")));
    const bound=bindAuditToCheckedSha({
      audit, results, claimedSha, checkedSha, repo:env.GITHUB_REPOSITORY,
      branch:env.GITHUB_REF_NAME
    });
    const output=resolve(workspace,outPath);
    writeFileSync(output, JSON.stringify(bound,null,2)+"\n");
    return bound;
  } finally {
    rmSync(temp,{recursive:true,force:true});
  }
}
if (process.argv[1] && fileURLToPath(import.meta.url)===resolve(process.argv[1])) {
  const output = process.argv.find(s=>s.startsWith("--output="))?.slice(9) || "oge95-same-sha-audit.json";
  if (!/^[a-zA-Z0-9_.-]{1,100}\.json$/.test(output)) throw Error("UNSAFE_OUTPUT_NAME");
  const evidence = produceSameShaAudit({outPath:output});
  console.log(JSON.stringify({
    schema:evidence.schema, source_sha:evidence.source_sha, result:evidence.state,
    checked:evidence.audit.length,mode:evidence.source_sha_attestation.execution_mode,
    approval:evidence.commit_manifest.execution_approved,output
  }));
}
