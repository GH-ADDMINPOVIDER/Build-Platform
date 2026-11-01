import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");

test("SELF_HOST_MACHINE separates display label, physical host and runner registration", () => {
  const machine = read("worker/self-host-machine.ts");
  const roster = read("config/unifiend-phase-ii-agent-roster.json");
  const codex = read("worker/codex-left-arm-api.ts");
  const endpoint = read("worker/connector-endpoint-api.ts");
  const ui = read("src/UnifiendNext.tsx");
  assert.match(machine, /id: "SELF_HOST_MACHINE"/);
  assert.match(machine, /display_name: "Ocian-S-Host"/);
  assert.match(machine, /physical_hostname: "OCIAN-S-Host"/);
  assert.match(machine, /runner_registration: "wave-runner-01"/);
  assert.match(machine, /runner_count: 1/);
  assert.match(roster, /"canonical_machine_id": "SELF_HOST_MACHINE"/);
  assert.match(roster, /"github_runner_registration": "wave-runner-01"/);
  assert.match(codex, /selfHostMachineMetadata/);
  assert.match(endpoint, /machine_id:SELF_HOST_MACHINE\.id/);
  assert.match(ui, /SELF HOST_MACHINE/);
  assert.match(ui, /Physical host/);
  assert.match(ui, /Ocian-S-Host/);
});

test("historical runner aliases remain explicit and are not treated as agent accounts", () => {
  const machine = read("worker/self-host-machine.ts");
  assert.match(machine, /historical_aliases/);
  assert.match(machine, /codex-selfhost:wave-runner-01/);
  assert.match(machine, /runner_count: 1/);
});


test("canonical GH-ADDMINPOVIDER self-host workflows share one registration and immutable repository identity", () => {
  const consumer = read(".github/workflows/unifiend-command-consumer.yml");
  const closeout = read(".github/workflows/oge-28-provider-codex-closeout.yml");
  const smoke = read(".github/workflows/unifiend-self-hosted-smoke.yml");
  for (const workflow of [consumer, closeout, smoke]) {
    assert.ok(workflow.includes("runs-on: [GH-ADDMINPOVIDER]"));
    assert.ok(!workflow.includes("runs-on: [self-hosted, linux, x64, wave]"));
  }
  assert.ok(closeout.includes("github.repository_id == '1429580446'"));
  assert.ok(closeout.includes("github.repository_owner_id == '342175560'"));
  assert.ok(closeout.includes("github.actor == 'GH-ADDMINPOVIDER'"));
  assert.ok(smoke.includes('test "$RUNNER_NAME" = "GH-ADDMINPOVIDER"'));
  assert.ok(consumer.includes("github.repository_id == '1429580446'"));
  // Do not falsify observed host binding: this changes only after an actual cutover.
  assert.ok(read("worker/self-host-machine.ts").includes('runner_registration: "wave-runner-01"'));
});
