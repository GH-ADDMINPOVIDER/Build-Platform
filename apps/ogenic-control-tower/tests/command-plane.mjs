import assert from "node:assert/strict";
import { listSoloCommands, normalizeCommandInput, resolveSoloCommand } from "../command-plane/command-plane.js";

const commands = listSoloCommands();
assert.equal(commands.length, 10);
assert.equal(commands[0].command, "/solo.help");
assert.ok(commands.some((item) => item.command === "/solo.run"));
assert.ok(commands.some((item) => item.command === "/solo.rollback.plan"));

const parsed = normalizeCommandInput("  /SOLO.inspect   GH-ADDMINPOVIDER/Build-Platform  ");
assert.equal(parsed.token, "/solo.inspect");
assert.equal(parsed.args, "GH-ADDMINPOVIDER/Build-Platform");

const help = resolveSoloCommand("/WF.help", null);
assert.equal(help.recognized, true);
assert.equal(help.command, "/solo.help");
assert.equal(help.dispatched, false);
assert.equal(help.executionState, "PLANNED_ONLY");

const inspect = resolveSoloCommand("/solo.inspect GH-ADDMINPOVIDER/Build-Platform", {
  primary: "10.observability_control",
  support: ["01.code_build"],
  approval: "auto",
});
assert.equal(inspect.name, "inspect");
assert.equal(inspect.adapter, "connected_read_adapter");
assert.equal(inspect.executionState, "WAITING_ADAPTER_CONTRACT");
assert.equal(inspect.dispatched, false);
assert.equal(inspect.args, "GH-ADDMINPOVIDER/Build-Platform");

const natural = resolveSoloCommand("ตรวจสถานะ GitHub และ workflow", {
  primary: "10.observability_control",
  support: ["01.code_build"],
  approval: "auto",
});
assert.equal(natural.command, "/solo.route");
assert.equal(natural.args, "ตรวจสถานะ GitHub และ workflow");
assert.equal(natural.route.primary, "10.observability_control");

const run = resolveSoloCommand("/solo.run deploy production", {
  primary: "04.web_app",
  support: ["01.code_build"],
  approval: "human_approval_required_before_consequential_action",
});
assert.equal(run.approval, "human_approval_required_before_consequential_action");
assert.equal(run.executionState, "WAITING_ADAPTER_CONTRACT");
assert.equal(run.dispatched, false);

const unknown = resolveSoloCommand("/solo.destroy everything", null);
assert.equal(unknown.recognized, false);
assert.equal(unknown.executionState, "UNRECOGNIZED");

const again = resolveSoloCommand("/solo.inspect GH-ADDMINPOVIDER/Build-Platform", {
  primary: "10.observability_control",
  support: ["01.code_build"],
  approval: "auto",
});
assert.equal(inspect.correlationId, again.correlationId);
assert.equal(inspect.idempotencyKey, again.idempotencyKey);

console.log("Command Plane unit tests PASS");
