import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

const api = readFileSync("worker/task-inbox-api.ts", "utf8");
const entry = readFileSync("worker/entry-yellow-stone.ts", "utf8");
const fixture = JSON.parse(readFileSync("tests/fixtures/oge-57-task-inbox-roundtrip.json", "utf8"));

function taskId(key) {
  const digest = createHash("sha256").update(`owner-main:task-inbox:${key}`).digest("hex");
  return `taskinbox_${digest}`;
}

function simulateRoundtrip() {
  const sessions = new Set(fixture.sessions);
  const tasks = new Map();
  const events = [];

  function assign(input) {
    if (!sessions.has(input.origin_session_ref)) throw new Error("ORIGIN_SESSION_NOT_FOUND");
    if (!sessions.has(input.target_session_ref)) throw new Error("TARGET_SESSION_NOT_FOUND");
    const id = taskId(input.idempotency_key);
    if (tasks.has(id)) return { ...tasks.get(id), idempotent_replay: true };
    const row = {
      id,
      title: input.title,
      status: "QUEUED",
      resource_key: `1lss-session:${input.target_session_ref}`,
      source_ref: input.origin_session_ref,
      correlation_id: `taskinbox-corr-${id.slice("taskinbox_".length, "taskinbox_".length + 40)}`,
    };
    tasks.set(id, row);
    events.push({ task_id:id, event_type:"TASK_ASSIGNED", actor:"owner-main" });
    return { ...row, idempotent_replay:false };
  }

  function result(id, input) {
    const task = tasks.get(id);
    if (!task) throw new Error("TASK_NOT_FOUND");
    if (task.resource_key !== `1lss-session:${input.session_ref}`) {
      throw new Error("TASK_TARGET_SESSION_MISMATCH");
    }
    task.status = input.status;
    events.push({
      task_id:id,
      event_type:`TASK_RESULT_${input.status}`,
      actor:`session:${input.session_ref}`,
      external_ref:JSON.stringify({result_ref:input.result_ref,summary:input.summary}),
    });
    return task;
  }

  const first = assign({ ...fixture.assignment, idempotency_key: fixture.assignment.idempotency_key });
  const replay = assign({ ...fixture.assignment, idempotency_key: fixture.assignment.idempotency_key });
  assert.equal(first.id, replay.id);
  assert.equal(replay.idempotent_replay, true);

  assert.throws(
    () => result(first.id, fixture.wrong_target_result),
    /TASK_TARGET_SESSION_MISMATCH/,
  );

  const done = result(first.id, fixture.result);
  return { first, done, events };
}

test("OGE-57 reuses existing D1 tables only and owner-main remains canonical", () => {
  assert.match(api, /const CONVERSATION_ID = "owner-main"/);
  assert.match(api, /FROM chat_session_refs/);
  assert.match(api, /INSERT INTO agent_tasks/);
  assert.match(api, /INSERT OR IGNORE INTO agent_events/);
  assert.doesNotMatch(api, /CREATE TABLE|ALTER TABLE|DROP TABLE/);
});

test("assignment is owner-authenticated, idempotent, and validates both real sessions", () => {
  assert.match(api, /hasOwnerSession/);
  assert.match(api, /Idempotency-Key/);
  assert.match(api, /ORIGIN_SESSION_NOT_FOUND/);
  assert.match(api, /TARGET_SESSION_NOT_FOUND/);
  assert.match(api, /IDEMPOTENCY_CONFLICT/);
  assert.match(api, /taskinbox_/);
  assert.match(api, /resourceKey = `\$\{SESSION_PREFIX\}\$\{targetSessionRef\}`/);
  assert.match(api, /source_ref/);
});

test("target inbox is scoped only to 1lss-session:<session_ref>", () => {
  assert.match(api, /api\.get\("\/api\/task-inbox"/);
  assert.match(api, /WHERE resource_key = \?/);
  assert.match(api, /SESSION_REF_NOT_FOUND/);
});

test("only assigned target can write terminal result and D1 stores summary/reference only", () => {
  assert.match(api, /TASK_TARGET_SESSION_MISMATCH/);
  assert.match(api, /RESULT_STATES = new Set\(\["DONE", "BLOCKED", "FAILED"\]\)/);
  assert.match(api, /resultExternalRef\(resultRef, summary\)/);
  assert.match(api, /summary: summary \|\| null/);
  assert.match(api, /result_ref: resultRef \|\| null/);
  assert.match(api, /SECRET_LIKE_INPUT_REJECTED/);
});

test("owner-main trail exposes assignment/result events from canonical task state", () => {
  assert.match(api, /api\.get\("\/api\/task-inbox\/:id\/trail"/);
  assert.match(api, /FROM agent_events/);
  assert.match(api, /canonical_trail: "owner-main"/);
  assert.match(entry, /pathname\.startsWith\("\/api\/task-inbox"\)/);
});

test("roundtrip fixture proves assign -> inbox identity -> wrong-target reject -> result -> owner trail", () => {
  const out = simulateRoundtrip();
  assert.equal(out.first.status, "QUEUED");
  assert.equal(out.first.resource_key, "1lss-session:session-target");
  assert.equal(out.first.source_ref, "session-origin");
  assert.equal(out.done.status, "DONE");
  assert.deepEqual(out.events.map((row) => row.event_type), ["TASK_ASSIGNED", "TASK_RESULT_DONE"]);
  assert.equal(out.events[1].actor, "session:session-target");
  const persisted = JSON.parse(out.events[1].external_ref);
  assert.equal(persisted.summary, fixture.result.summary);
  assert.equal(persisted.result_ref, fixture.result.result_ref);
});
