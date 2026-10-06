import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  MAOP_LIFECYCLE,
  MaopReferenceRuntime,
  ReferenceReadAdapter,
} from "../dist/index.js";

const fixtures = JSON.parse(fs.readFileSync(new URL("../fixtures/interface-families.json", import.meta.url), "utf8"));

function runtime({ ruby = true } = {}) {
  return new MaopReferenceRuntime({
    yellow_authorize: async ({ capability }) => ({
      allowed: true,
      approval_required: capability.permission_class !== "READ",
      code: capability.permission_class === "READ" ? "YELLOW_READ_ALLOWED" : "YELLOW_APPROVAL_REQUIRED",
    }),
    ruby_verify: async ({ adapter_result }) => ({
      verified: ruby && adapter_result.ok && adapter_result.evidence_refs.length > 0,
      evidence_ref: ruby ? "ruby:fixture:pass" : undefined,
    }),
    check_cost: async () => ({ allowed: true, code: "ZERO_COST_FIXTURE" }),
  });
}

function actor(capabilityIds) {
  return {
    actor_id: "fixture-agent",
    actor_class: "agent",
    role: "conformance",
    provider: "ogenic",
    runtime: "local",
    capabilities: capabilityIds,
    readiness: "VERIFIED",
  };
}

function capability(row, permission = "READ") {
  return {
    capability_id: row.capability_id,
    provider_id: "fixture",
    adapter_id: row.adapter_id,
    permission_class: permission,
    environment: "staging",
    input_schema: { type: "object" },
    output_schema: { type: "object" },
    evidence_required: true,
    capability_version: "1",
  };
}

function task(capabilityId, key, permission = "READ", input = { query: "safe local fixture" }) {
  return {
    task_id: `task-${key}`,
    actor_id: "fixture-agent",
    capability_id: capabilityId,
    intent: "read local zero-cost fixture",
    input,
    environment: "staging",
    idempotency_key: key,
    requested_permission: permission,
    supported_protocol_versions: ["0.1.0"],
  };
}

test("reference runtime exposes the full canonical lifecycle", () => {
  assert.deepEqual(MAOP_LIFECYCLE, [
    "DISCOVER",
    "ADMIT",
    "CHECK_READINESS",
    "CHECK_COST",
    "CHECK_POLICY",
    "SELECT_ROUTE",
    "APPROVE_IF_REQUIRED",
    "OPERATE",
    "VERIFY",
    "RETAIN",
  ]);
});

test("five interface families execute only through local zero-cost READ adapters", async () => {
  assert.equal(fixtures.zero_cost, true);
  assert.equal(fixtures.provider_calls, false);
  assert.deepEqual(fixtures.interfaces.map((row) => row.family), ["mcp", "rest", "sdk", "webhook", "cli"]);

  const rt = runtime();
  const capabilityIds = fixtures.interfaces.map((row) => row.capability_id);
  rt.registerActor(actor(capabilityIds));

  for (const row of fixtures.interfaces) {
    rt.registerCapability(capability(row));
    rt.registerAdapter(new ReferenceReadAdapter(row.family, row.adapter_id));
  }

  for (const row of fixtures.interfaces) {
    const result = await rt.run(task(row.capability_id, `once-${row.family}`));
    assert.equal(result.ok, true);
    assert.equal(result.ruby_verified, true);
    assert.equal(result.retention_eligible, true);
    assert.equal(result.output.interface_family, row.family);
    assert.equal(result.output.local_fixture, true);
    assert.deepEqual(result.lifecycle, MAOP_LIFECYCLE);
  }
});

test("same idempotency key replays result without operating again", async () => {
  const row = fixtures.interfaces[0];
  const rt = runtime();
  rt.registerActor(actor([row.capability_id]));
  rt.registerCapability(capability(row));
  rt.registerAdapter(new ReferenceReadAdapter(row.family, row.adapter_id));
  const request = task(row.capability_id, "stable-replay");
  const first = await rt.run(request);
  const second = await rt.run(request);
  assert.equal(first.replayed, false);
  assert.equal(second.replayed, true);
  assert.deepEqual(second.output, first.output);
});

test("consequential capability stops at Yellow approval before adapter execution", async () => {
  const row = { family: "cli", capability_id: "fixture.cli.write", adapter_id: "reference-cli-write" };
  const rt = runtime();
  rt.registerActor(actor([row.capability_id]));
  rt.registerCapability(capability(row, "WRITE"));
  rt.registerAdapter(new ReferenceReadAdapter(row.family, row.adapter_id));
  const result = await rt.run(task(row.capability_id, "write-stop", "WRITE"));
  assert.equal(result.ok, false);
  assert.equal(result.safe_error.code, "HUMAN_APPROVAL_REQUIRED");
  assert.equal(result.lifecycle.includes("OPERATE"), false);
  assert.equal(result.retention_eligible, false);
});

test("secret-like task input is rejected before adapter selection", async () => {
  const row = fixtures.interfaces[1];
  const rt = runtime();
  rt.registerActor(actor([row.capability_id]));
  rt.registerCapability(capability(row));
  rt.registerAdapter(new ReferenceReadAdapter(row.family, row.adapter_id));
  const result = await rt.run(task(row.capability_id, "secret-reject", "READ", { api_key: "sk-example-secret-value-123456" }));
  assert.equal(result.ok, false);
  assert.equal(result.safe_error.code, "SECRET_LIKE_INPUT_REJECTED");
  assert.equal(result.evidence.length, 0);
});

test("Ruby rejection prevents Green retention even when adapter returns success", async () => {
  const row = fixtures.interfaces[2];
  const rt = runtime({ ruby: false });
  rt.registerActor(actor([row.capability_id]));
  rt.registerCapability(capability(row));
  rt.registerAdapter(new ReferenceReadAdapter(row.family, row.adapter_id));
  const result = await rt.run(task(row.capability_id, "ruby-fail"));
  assert.equal(result.ok, true);
  assert.equal(result.ruby_verified, false);
  assert.equal(result.retention_eligible, false);
  assert.equal(result.evidence.every((item) => item.verification_state !== "verified"), true);
});


test("unsupported protocol version fails closed before adapter execution", async () => {
  const row = fixtures.interfaces[0];
  const rt = runtime();
  rt.registerActor(actor([row.capability_id]));
  rt.registerCapability(capability(row));
  rt.registerAdapter(new ReferenceReadAdapter(row.family, row.adapter_id));
  const request = task(row.capability_id, "protocol-mismatch");
  request.supported_protocol_versions = ["9.9.9"];
  const result = await rt.run(request);
  assert.equal(result.ok, false);
  assert.equal(result.safe_error.code, "PROTOCOL_VERSION_UNSUPPORTED");
  assert.equal(result.lifecycle.includes("OPERATE"), false);
  assert.equal(result.retention_eligible, false);
});

test("evidence timestamps are generated at runtime", async () => {
  const row = fixtures.interfaces[0];
  const rt = runtime();
  rt.registerActor(actor([row.capability_id]));
  rt.registerCapability(capability(row));
  rt.registerAdapter(new ReferenceReadAdapter(row.family, row.adapter_id));
  const before = Date.now();
  const result = await rt.run(task(row.capability_id, "fresh-evidence-time"));
  const after = Date.now();
  assert.equal(result.ok, true);
  assert.ok(result.evidence.length > 0);
  for (const item of result.evidence) {
    const createdAt = Date.parse(item.created_at);
    assert.equal(Number.isNaN(createdAt), false);
    assert.ok(createdAt >= before && createdAt <= after);
  }
});
