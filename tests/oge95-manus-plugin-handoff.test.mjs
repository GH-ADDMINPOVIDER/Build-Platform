import assert from "node:assert/strict";
import test from "node:test";
import { probeProviderReadiness } from "../scripts/oge95-provider-readiness.mjs";
import { normalizeManusPluginTask } from "../scripts/oge95-manus-plugin-handoff.mjs";
import { evaluateFinalIntake, digest } from "../scripts/oge95-final-review-intake.mjs";
import { readFileSync } from "node:fs";

const sha="a".repeat(40);
const auditSource = JSON.parse(readFileSync("docs/evidence/oge-62-flow-audit-latest.json", "utf8"));
const audit = { ...auditSource, source_sha: sha };
const hash=digest(audit);
const task = { tool: "initiate_research", task_id:"example_task_1", task_url:"https://manus.im/app/example-task-1" };

test("No MANUS_API_KEY does not imply ChatGPT Manus plugin disconnected", async () => {
  let calls=0;
  const state=await probeProviderReadiness({}, async()=>{calls++;throw Error("unexpected");});
  assert.equal(calls,0);
  assert.equal(state.manus.state,"NOT_CONFIGURED");
  assert.equal(state.manus.transport,"MANUS_DIRECT_API_V2");
  assert.equal(state.manus_plugin.state,"EXTERNAL_PLUGIN_NOT_PROBED");
  assert.equal(state.manus_plugin.transport,"CHATGPT_MANUS_PLUGIN_MCP");
});

test("Plugin task can enter reviewer intake without direct Manus API key", () => {
  const receipt=normalizeManusPluginTask({task, sourceSha:sha, auditSha256:hash, writerActor:"codex-code-author"});
  assert.equal(receipt.transport,"CHATGPT_MANUS_PLUGIN_MCP");
  assert.equal(receipt.manuscript_api_key_required,false);
  assert.equal(receipt.result,"INCONCLUSIVE");
  assert.equal(receipt.github_commit_permitted,false);
  const evaluated=evaluateFinalIntake({audit,sourceSha:sha,writerActor:"codex-code-author",receipts:{manus:receipt}});
  assert.equal(evaluated.github_audit,"PASS");
  assert.equal(evaluated.final_intake_state,"REVIEW_INCONCLUSIVE");
  assert.equal(evaluated.yellow_commit_or_deploy_authority,"NOT_GRANTED");
  assert.equal(evaluated.green_verified_promotion,false);
});

test("Plugin initiation cannot invent PASS or bypass Ruby with OpenAI review", () => {
  const receipt=normalizeManusPluginTask({task:{...task, result:"PASS",status:"completed",write_permission:true},sourceSha:sha,auditSha256:hash});
  assert.equal(receipt.result,"INCONCLUSIVE");
  assert.equal(receipt.side_effects,false);
  assert.equal(receipt.review_evidence_status,"PLUGIN_TASK_REFERENCE_ONLY_NOT_COMPLETED_OR_AUDITED");
});

test("Reject forged plugin task host, unsupported action, missing SHA, author-reviewer collision",()=>{
  for(const input of [
    { task:{...task, task_url:"https://manus.im.attacker.com/app/1"} },
    { task:{...task, task_url:"http://manus.im/app/1"} },
    { task:{...task, tool:"initiate_website"} },
    { task:{...task, task_id:"../evil"} },
    { task:{...task}, sourceSha:"1" },
    { task:{...task}, auditSha256:"1" },
    { task:{...task}, writerActor:"manus-chatgpt-plugin" }
  ]) {
    assert.throws(()=>normalizeManusPluginTask({task,sourceSha:sha,auditSha256:hash,writerActor:"codex-code-author",...input}));
  }
});

test("Manus plugin has no implicit write access to staging despite valid reference",()=>{
  const out=normalizeManusPluginTask({task,sourceSha:sha,auditSha256:hash});
  assert.equal(out.yellow_authorization,"NOT_GRANTED");
  assert.equal(out.model_task_invoked_by_this_script,false);
  assert.equal(out.github_commit_permitted,false);
  assert.doesNotMatch(JSON.stringify(out),/sk-[a-zA-Z0-9]/);
});
