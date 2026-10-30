/**
 * STONE RUNNER #06 — evidence-based learning cache, not self-training or a new policy gate.
 * Three inputs: deterministic GitHub audit + optional Manus and OpenAI reviewer receipts.
 * Retains only bounded provenance/status patterns for later Ruby analysis.
 * Never calls an LLM, writes D1, issues approval, or changes code.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const LEARNING_SCHEMA = "OGE95_STONE_RUNNER_LEARNING_V1";
const REVIEW_SCHEMA = "OGE95_FINAL_REVIEW_INTAKE_V1";
const SHA40 = /^[a-f0-9]{40}$/i;
const SHA64 = /^[a-f0-9]{64}$/i;
const VALID_REVIEW_STATES = new Set([
  "NOT_CONNECTED", "PASS_UNATTESTED", "REVIEW_FAIL",
  "INCONCLUSIVE", "REJECTED_INVALID_OR_MISMATCHED"
]);
const VALID_GITHUB = new Set(["PASS", "BLOCKED", "HISTORICAL_UNBOUND"]);
const MAX_ENTRIES = 40;
const hash = (data) => createHash("sha256").update(data).digest("hex");

function compactPrevious(previous) {
  if (previous?.schema !== LEARNING_SCHEMA ||
      previous?.repository !== "Wave-Runner-2/Build-Platform" ||
      previous?.branch !== "Unified-on-Progress" ||
      !Array.isArray(previous.entries)) return [];
  // Snapshot is UNTRUSTED: only allow whitelisted bounded structure, no provider prose.
  return previous.entries.slice(-MAX_ENTRIES).flatMap((entry) => {
    if (!SHA40.test(entry?.source_sha ?? "") ||
        !SHA64.test(entry?.audit_sha256 ?? "") ||
        !SHA64.test(entry?.observation_id ?? "") ||
        !VALID_GITHUB.has(entry?.github ?? "") ||
        !VALID_REVIEW_STATES.has(entry?.manus ?? "") ||
        !VALID_REVIEW_STATES.has(entry?.openai ?? "")) return [];
    const record = {
      source_sha: entry.source_sha,
      audit_sha256: entry.audit_sha256,
      github: entry.github,
      manus: entry.manus,
      openai: entry.openai
    };
    if (hash(JSON.stringify(record)) !== entry.observation_id) return [];
    return [{ observation_id: entry.observation_id, ...record }];
  });
}

export function deriveStoneRunnerLearning({ sourceSha, intake, previous = null }) {
  if (!SHA40.test(sourceSha ?? "")) throw new Error("STAGING_SHA_REQUIRED");
  if (intake?.schema !== REVIEW_SCHEMA || intake.source_sha !== sourceSha ||
      !SHA64.test(intake.github_audit_sha256 ?? "") ||
      !VALID_GITHUB.has(intake.github_audit) ||
      intake.independent_ruby_verified !== false ||
      intake.green_verified_promotion !== false ||
      intake.yellow_commit_or_deploy_authority !== "NOT_GRANTED") {
    throw new Error("UNTRUSTED_REVIEW_INTAKE");
  }
  const manus = intake.reviewers?.manus?.state;
  const openai = intake.reviewers?.openai?.state;
  if (!VALID_REVIEW_STATES.has(manus) || !VALID_REVIEW_STATES.has(openai))
    throw new Error("REVIEWER_STATE_INVALID");

  const record = {
    source_sha: sourceSha,
    audit_sha256: intake.github_audit_sha256,
    github: intake.github_audit,
    manus, openai
  };
  const observation = {
    observation_id: hash(JSON.stringify(record)),
    ...record
  };
  const seen = new Map();
  for (const e of [...compactPrevious(previous), observation])
    seen.set(e.observation_id, e);
  const entries = [...seen.values()].slice(-MAX_ENTRIES);

  const lessons = [];
  const add = (code, reason) => lessons.push({ code, reason, state: "UNVERIFIED_CANDIDATE", auto_execute: false });
  if (observation.github === "HISTORICAL_UNBOUND")
    add("REQUIRE_CURRENT_SHA_GITHUB_AUDIT", "Previous OGE-62 audit lacks current source SHA binding");
  if (observation.github === "BLOCKED")
    add("REPAIR_DETERMINISTIC_AUDIT", "GitHub audit failed or was invalid for this intake");
  if (manus === "NOT_CONNECTED")
    add("CONNECT_MANUS_WHEN_AUTHORIZED", "No independently verified Manus task receipt exists");
  if (openai === "NOT_CONNECTED")
    add("CONNECT_OPENAI_WHEN_AUTHORIZED", "No independently verified OpenAI review receipt exists");
  if ([manus, openai].some((s) => s === "REVIEW_FAIL" || s === "REJECTED_INVALID_OR_MISMATCHED"))
    add("INVESTIGATE_REVIEW_CONFLICT", "Reviewer reported failure or invalid provenance");
  if ([manus, openai].some((s) => s === "PASS_UNATTESTED"))
    add("VERIFY_PROVIDER_PROVENANCE_WITH_RUBY", "Model PASS needs independent Ruby verification");

  return {
    schema: LEARNING_SCHEMA,
    kind: "REBUILDABLE_EVIDENCE_LEARNING_CACHE_NOT_CANONICAL_MEMORY",
    placement: "RUNTIME_X10_FAN_IN_TO_GITHUB_MANUS_OPENAI_THEN_RUBY_YELLOW_GREEN",
    product: "STONE RUNNER",
    capability: "EPHEMERAL_RUNTIME_EXECUTION",
    repository: "Wave-Runner-2/Build-Platform",
    branch: "Unified-on-Progress",
    source_sha: sourceSha,
    observation_count: entries.length,
    entries,
    latest_observation_id: observation.observation_id,
    learning_candidates: lessons,
    model_weights_updated: false,
    independent_ruby_verified: false,
    promoted_to_green_1lss: false,
    direct_provider_calls: 0,
    new_d1_state_or_schema: false,
    permission_to_commit_or_deploy: "NOT_GRANTED"
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const arg = (key, fallback = "") =>
    process.argv.find((a) => a.startsWith("--" + key + "="))?.slice(key.length + 3) ?? fallback;
  const sourceSha = arg("sha", process.env.GITHUB_SHA ?? "");
  const intake = JSON.parse(readFileSync(arg("intake", "oge95-final-review-intake.json"), "utf8"));
  const priorPath = arg("previous");
  const previous = priorPath && existsSync(priorPath)
    ? JSON.parse(readFileSync(priorPath, "utf8")) : null;
  const output = deriveStoneRunnerLearning({ sourceSha, intake, previous });
  const text = JSON.stringify(output, null, 2) + "\n";
  if (arg("output")) writeFileSync(arg("output"), text);
  process.stdout.write(text);
}
