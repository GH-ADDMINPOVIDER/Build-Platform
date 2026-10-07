import assert from "node:assert/strict";

const base = process.env.CCS_BASE_URL || "http://127.0.0.1:8787";
const headers = {
  "content-type": "application/json",
  "x-ogenic-ops-key": process.env.CCS_OPS_KEY || "lab-ops-key",
};

async function get(path) {
  const response = await fetch(base + path, { headers: { "x-ogenic-ops-key": headers["x-ogenic-ops-key"] } });
  const body = await response.json();
  return { response, body };
}

async function post(path, body) {
  const response = await fetch(base + path, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  return { response, body: payload };
}

const status = await get("/api/ccs/status");
assert.equal(status.response.status, 200);
assert.equal(status.body.protocol, "CCS/1.0");

const card = {
  card_id: "card.lab.github.read",
  holder: "lab-agent-01",
  role: "sandbox_reader",
  capability: "read_file",
  scope: { environment: "staging", permission: "READ" },
};

const journey = [];
for (const [state, verb] of [
  ["ABSENT", "INSERT"],
  ["INSERTED", "VERIFY"],
  ["VERIFIED", "USE"],
  ["IN_USE", "RETURN"],
]) {
  const step = await post("/api/ccs/envelope", { ...card, state, verb });
  assert.equal(step.response.status, 200);
  assert.equal(step.body.ok, true);
  journey.push(step.body.action);
}

const lease = await post("/api/ccs/lease", {
  borrower: {
    card_id: "card.lab.github.read.a",
    slot_id: "slot.github.a",
    holder: "lab-agent-01",
    tier: "WHITE",
    state: "READY",
    provider_id: "github",
    capability_id: "read_file",
    permission_class: "READ",
    environment: "staging",
    lease_eligible: true,
  },
  source: {
    card_id: "card.lab.github.read.b",
    slot_id: "slot.github.b",
    holder: "lab-pool-01",
    tier: "WHITE",
    state: "READY",
    provider_id: "github",
    capability_id: "read_file",
    permission_class: "READ",
    environment: "staging",
    lease_eligible: true,
  },
  reason: "RATE_LIMIT",
  requested_permission: "READ",
  requested_ttl_minutes: 5,
  requested_max_calls: 5,
  operation: "staging read",
});
assert.equal(lease.response.status, 200);
assert.equal(lease.body.ok, true);
assert.equal(lease.body.protocol, "CCS/1.0");
assert.equal(lease.body.evidence?.verifier, "RUBY");

const publicOutput = JSON.stringify({ status: status.body, journey, lease: lease.body });
assert.doesNotMatch(publicOutput, /\b(token|credential|vault|secret)\b/i);

console.log(JSON.stringify({
  ok: true,
  protocol: "CCS/1.0",
  item_test: "PASS",
  journey: journey.map((item) => item.verb),
  lease: {
    ok: lease.body.ok,
    max_calls: lease.body.lease?.max_calls,
    return_state: lease.body.lease?.return_state,
    evidence: lease.body.evidence?.state,
  },
}, null, 2));
