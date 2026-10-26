import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");

test("SELF_HOST_MACHINE separates display label, physical host and runner registration", () => {
  const machine = read("worker/self-host-machine.ts");
  const roster = read("config/wave-phase-ii-agent-roster.json");
  const codex = read("worker/codex-left-arm-api.ts");
  const endpoint = read("worker/connector-endpoint-api.ts");
  const ui = read("src/WaveNext.tsx");
  assert.match(machine, /id: "SELF_HOST_MACHINE"/);
  assert.match(machine, /display_name: "SELF HOST_MACHINE"/);
  assert.match(machine, /physical_hostname: "OCIAN-S-Host"/);
  assert.match(machine, /runner_registration: "wave-runner-01"/);
  assert.match(machine, /runner_count: 1/);
  assert.match(roster, /"canonical_machine_id": "SELF_HOST_MACHINE"/);
  assert.match(roster, /"github_runner_registration": "wave-runner-01"/);
  assert.match(codex, /selfHostMachineMetadata/);
  assert.match(endpoint, /machine_id:SELF_HOST_MACHINE\.id/);
  assert.match(ui, /SELF HOST_MACHINE/);
  assert.match(ui, /Runner registration/);
});

test("historical runner aliases remain explicit and are not treated as agent accounts", () => {
  const machine = read("worker/self-host-machine.ts");
  assert.match(machine, /historical_aliases/);
  assert.match(machine, /codex-selfhost:wave-runner-01/);
  assert.match(machine, /runner_count: 1/);
});
