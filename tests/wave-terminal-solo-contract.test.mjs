import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read=(p)=>fs.readFileSync(new URL("../"+p,import.meta.url),"utf8");

test("Terminal Solo is a special SSH IDEs OPC environment, not an eighth stone or agent group",()=>{
  const diagram=read("src/StoneCircuitDiagram.tsx");
  const section=diagram.split('data-execution-mode="solo"')[1]||"";
  assert.match(diagram,/TERMINAL ENVIRONMENT · SOLO/);
  assert.match(section,/SSH/);
  assert.match(section,/IDEs/);
  assert.match(section,/OPC · OpenCode/);
  assert.match(section,/SEPARATE FROM AGENT REGISTRY/);
  assert.match(section,/CLI ยังไม่ได้ติดตั้ง/);
  const canonical=diagram.split("const stones: Stone[] = [")[1].split("];")[0];
  assert.equal((canonical.match(/id: "/g)||[]).length,7);
  assert.doesNotMatch(canonical,/OPC|OpenCode|IDEs/);
});

test("ATHENA and Yellow Stone accept signed Owner Session without second confirmation",()=>{
  const entry=read("worker/entry-yellow-stone.ts");
  const consumer=read("scripts/wave-command-consumer.mjs");
  assert.match(entry,/hasOwnerOrOpsAccess\(request, env\)/);
  assert.match(entry,/hasOwnerSession\(request, env\)/);
  assert.doesNotMatch(entry,/code: "OWNER_APPROVAL_REQUIRED"/);
  assert.match(entry,/OWNER_APPROVED_COMMAND_QUEUED/);
  assert.match(entry,/capability = 'codex_selfhost'/);
  assert.match(entry,/COMMAND_CONSUMER_STARTED/);
  assert.match(entry,/COMMAND_RESULT_/);
  assert.match(consumer,/\/api\/wave\/command\/claim/);
  assert.match(consumer,/\/api\/wave\/command\/result/);
  assert.match(consumer,/process\.env\.GITHUB_REF_NAME !== "phase-vi-provider-incentive-metering"/);
  assert.match(consumer,/spawnSync\("codex", \["exec"/);
});

test("terminal solo wrapper is a host-stable lock and executes only approved consumer",()=>{
  const shell=read("scripts/wave-terminal-solo.sh");
  const workflow=read(".github/workflows/wave-command-consumer.yml");
  assert.match(shell,/wave-runner-01/);
  assert.match(shell,/phase-vi-provider-incentive-metering/);
  assert.match(shell,/WAVE_TASK_ID/);
  assert.match(shell,/^lock="\$\{HOME:\?\}\/\.ogenic-wave-terminal-solo\.lock"/m);
  assert.match(shell,/flock -w 900 9/);
  assert.match(shell,/node scripts\/wave-command-consumer\.mjs/);
  assert.doesNotMatch(shell, /exec\s+(?:opencode|code-server)/);
  assert.doesNotMatch(shell, /agent.*registry.*register/i);
  assert.match(workflow,/bash scripts\/wave-terminal-solo\.sh/);
  assert.match(workflow,/runs-on: \[self-hosted, linux, x64, wave\]/);
  assert.match(workflow,/Infisical\/secrets-action/);
  assert.match(workflow,/cancel-in-progress: false/);
  assert.match(workflow,/env:\n\s+WAVE_TASK_ID: \$\{\{ inputs\.task_id \}\}/);
  assert.match(workflow,/\[\[ "\$WAVE_TASK_ID" =~ \^wavecmd_/);
  const validateBlock = workflow.split("- name: Validate task scope")[1].split("- name: Discover Infisical project")[0];
  assert.doesNotMatch(validateBlock,/\[\[ "\$\{\{ inputs\.task_id/);
});

test("the scope boundary forbids secret outputs and production modifications",()=>{
  const shell=read("scripts/wave-terminal-solo.sh");
  const contract=read("worker/wave-command-contract.ts");
  const consumer=read("scripts/wave-command-consumer.mjs");
  assert.match(contract,/SECRET_LIKE_INPUT_REJECTED/);
  assert.match(contract,/ENVIRONMENT_SCOPE_MISMATCH/);
  assert.match(consumer,/Never touch main, production, Candy, D1 schema/);
  // The consumer now categorizes credential markers rather than using the
  // former 'secretLike' identifier. Keep protection checks, not a stale name.
  assert.match(consumer,/const protectedMarkers = \[/);
  for (const category of ["openai_key","github_token","bearer_token","pem_private_key"]) {
    assert.ok(consumer.includes('["' + category + '",'), "guard class: " + category);
  }
  assert.match(consumer,/const stdoutGuardClasses = protectedMarkers\.filter/);
  assert.match(consumer,/const stderrGuardClasses = protectedMarkers\.filter/);
  assert.match(consumer,/WAVE_CONSUMER_GUARD_CHANNELS=/);
  assert.match(consumer,/const guardClasses = stdoutGuardClasses/);
  assert.match(consumer,/const guarded = guardClasses\.length !== 0/);
  assert.match(consumer,/WAVE_CONSUMER_INTERNAL_STDERR_REDACTED/);
  assert.match(consumer,/const stderrGuardClasses = protectedMarkers\.filter/);
  assert.match(consumer,/const status = guarded \? "BLOCKED"/);
  assert.match(consumer,/WAVE_CONSUMER_SAFE_FAILURE=/);
  assert.doesNotMatch(consumer,/process\.stdout\.write\(combined\)/);

  assert.match(shell,/umask 077/);
  assert.match(shell,/chmod 600/);
});


test("Codex child environment must not inherit Infisical GitHub or Owner secrets",()=>{
  const consumer=read("scripts/wave-command-consumer.mjs");
  const workflow=read(".github/workflows/wave-command-consumer.yml");
  assert.doesNotMatch(consumer,/env:\s*\{\s*\.\.\.process\.env/);
  assert.match(consumer,/Object\.fromEntries\(/);
  assert.match(consumer,/OGENIC_EXECUTION_SCOPE/);
  assert.match(workflow,/persist-credentials: false/);
  assert.match(workflow,/INFISICAL_ORG_ID/);
  assert.match(workflow,/INFISICAL_ORG_SLUG/);
});
