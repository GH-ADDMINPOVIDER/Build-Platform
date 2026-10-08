/**
 * OGE-95 Manus ChatGPT Plugin/MCP handoff — no Manus API key required.
 * The ChatGPT-hosted plugin can initiate tasks. It is NOT GitHub commit authority.
 * A task reference is a transport receipt, not a completed code review.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
const SHA40 = /^[0-9a-f]{40}$/i;
const SHA64 = /^[0-9a-f]{64}$/i;
const TASK_ID = /^[a-zA-Z0-9_-]{5,128}$/;

export function normalizeManusPluginTask({ task, sourceSha, auditSha256, writerActor } = {}) {
  if (!SHA40.test(sourceSha ?? "") || !SHA64.test(auditSha256 ?? ""))
    throw Error("EXACT_SOURCE_SHA_AND_AUDIT_DIGEST_REQUIRED");
  if (!task || task.tool !== "initiate_research" || !TASK_ID.test(task.task_id ?? ""))
    throw Error("ACTUAL_MANUS_RESEARCH_PLUGIN_TASK_REQUIRED");
  let taskUrl;
  try { taskUrl = new URL(task.task_url); }
  catch { throw Error("MANUS_TASK_URL_REQUIRED"); }
  if (taskUrl.protocol !== "https:" || taskUrl.username || taskUrl.password ||
      !["manus.im", "www.manus.im", "manus.ai", "www.manus.ai"].includes(taskUrl.hostname) ||
      taskUrl.hash || taskUrl.port)
    throw Error("MANUS_HTTPS_TASK_REFERENCE_REQUIRED");
  if (writerActor === "manus-chatgpt-plugin")
    throw Error("INDEPENDENT_AUTHOR_REVIEWER_REQUIRED");
  // The exposed plugin initiates work but does not supply a verified generic audit,
  // GitHub checkout/write, or completed task receipt to this GitHub workflow.
  // Never turn an initiated task into a PASS or grant commit/deploy permissions.
  return {
    schema: "OGE95_AGENT_REVIEW_V1",
    provider: "manus",
    transport: "CHATGPT_MANUS_PLUGIN_MCP",
    source_sha: sourceSha,
    audit_sha256: auditSha256,
    task_id: task.task_id,
    reviewer_actor: "manus-chatgpt-plugin",
    permission: "READ_ONLY",
    proof_ref: taskUrl.toString(),
    result: "INCONCLUSIVE",
    side_effects: false,
    review_evidence_status: "PLUGIN_TASK_REFERENCE_ONLY_NOT_COMPLETED_OR_AUDITED",
    manus_api_key_required: false,
    model_task_invoked_by_this_script: false,
    github_commit_permitted: false,
    yellow_authorization: "NOT_GRANTED",
    note: "This reference can be attached for tracking but cannot certify a code change or grant final DONE."
  };
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const arg = (key) =>
    process.argv.find((x) => x.startsWith("--" + key + "="))?.slice(key.length + 3);
  const taskPath = arg("task");
  if (!taskPath) throw Error("MANUS_PLUGIN_TASK_FILE_REQUIRED");
  const task = JSON.parse(readFileSync(taskPath, "utf8"));
  const result = normalizeManusPluginTask({
    task,
    sourceSha: arg("sha") || process.env.GITHUB_SHA,
    auditSha256: arg("audit-sha"),
    writerActor: arg("writer") || "unknown"
  });
  const json = JSON.stringify(result, null, 2) + "\n";
  if (arg("output")) writeFileSync(arg("output"), json);
  process.stdout.write(json);
}
