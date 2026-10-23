import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read=(path)=>readFileSync(path,"utf8");
const policy=JSON.parse(read("config/gs-command-invocation.v1.json"));
const aliases=JSON.parse(read("config/owner-runtime-labels.json"));
const dispatch=read("worker/wave-command-dispatch.ts");
const entry=read("worker/entry-yellow-stone.ts");
const workflow=read(".github/workflows/wave-command-consumer.yml");
const consumer=read("scripts/wave-command-consumer.mjs");
const wrapper=read("scripts/wave-terminal-solo.sh");
const contract=read("worker/wave-command-contract.ts");

test("one GH2 Addmin Provider only; store is archive, not command target",()=>{
 assert.equal(aliases.active_provider.label,"GH-2 Addmin Provider");
 assert.equal(aliases.archive_store.label,"store");
 assert.equal(aliases.archive_store.can_receive_new_commands,false);
 assert.equal(policy.dispatch.repository,"Wave-Runner-2/Build-Platform");
 assert.equal(policy.dispatch.never_target_archive,true);
 assert.match(dispatch,/api\.github\.com\/repos\/Wave-Runner-2\/Build-Platform\/actions\/workflows/);
 assert.doesNotMatch(dispatch,/api\.github\.com\/repos\/Ogenicchocolate21debug/);
});
test("GS signed WAVE command uses the only real codex_selfhost/openai route",()=>{
 assert.equal(policy.call.method,"POST");
 assert.equal(policy.call.url,"https://wave.ogenicchocolate.com/api/wave/command");
 assert.equal(policy.call.payload.capability,"codex_selfhost");
 assert.equal(policy.call.payload.provider,"openai");
 assert.equal(policy.call.payload.environment,"staging");
 assert.match(entry,/explicitCapability === "codex_selfhost" && explicitProvider === "openai"/);
 assert.match(entry,/hasOwnerSession\(request, env\)/);
 assert.match(entry,/dispatchWaveCommandConsumer\(env, taskId\)/);
 assert.match(contract,/SECRET_LIKE_INPUT_REJECTED/);
});
test("same physical OCIAN host, same registered runner and Codex home",()=>{
 assert.equal(policy.physical_host,"OCIAN-S-Host");
 assert.equal(policy.codex_executor,"Codex S-Host");
 assert.equal(policy.runner_service,"wave-runner-01");
 assert.equal(policy.codex_home,"/home/wave/.codex");
 assert.match(workflow,/runs-on: \[self-hosted, linux, x64, wave\]/);
 assert.match(workflow,/\$RUNNER_NAME/);
 assert.match(wrapper,/GITHUB_REPOSITORY/);
 assert.match(wrapper,/Wave-Runner-2\/Build-Platform/);
 assert.match(consumer,/spawnSync\("codex", \["exec"/);
 assert.match(consumer,/CODEX_HOME/);
});
test("queued or dispatched is not E2E and readback needs matching hash",()=>{
 assert.match(entry,/COMMAND_MANUAL_DISPATCH_REQUIRED/);
 assert.match(entry,/COMMAND_DISPATCHED/);
 assert.match(entry,/COMMAND_RESULT_DONE/);
 assert.match(consumer,/D1_COMMAND_RESULT_DONE_READBACK_UNVERIFIED/);
 assert.match(consumer,/evidence\.result_sha256 === resultHash/);
 assert.ok(policy.result.required.includes("execution.consumer_proven=true"));
});
test("cannot reinterpret task context schema as container requirement",()=>{
 assert.equal(policy.context.contract,"wave.task.envelope.v1");
 assert.equal(policy.context.enable_only_after_d1_staging_binding_readback,true);
 assert.equal(policy.constraints.no_second_runner,true);
 assert.equal(policy.constraints.no_docker_required,true);
 assert.equal(policy.constraints.no_main_or_prod,true);
});
