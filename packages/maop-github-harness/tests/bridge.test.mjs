import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { MaopGithubBridge } from "../dist/bridge.js";
import { apply, inject } from "../dist/plugin.js";

const verifiedYellow = async (request) => ({
  ok: true,
  run_id: "ys_run_fixture",
  verification: { status: "verified" },
  output: { path: request.input.path ?? null, repository: "Wave-Runner-2/Build-Platform" },
});

const verifiedRuby = async () => ({ verified: true, evidence_ref: "ruby:fixture:pass" });

test("plugin declares tools injection and registers six capability-specific tools", async () => {
  assert.deepEqual(inject, ["tools"]);
  const registered = [];
  const disposed = [];
  let cleanup;
  apply({
    tools: {
      register(tool) {
        registered.push(tool);
        return () => disposed.push(tool.name);
      },
    },
    effect(fn) { cleanup = fn(); },
  }, { executeYellow: verifiedYellow, verifyRuby: verifiedRuby });
  assert.equal(registered.length, 6);
  assert.deepEqual(registered.map((tool) => tool.name).sort(), [
    "github.actions.status",
    "github.code.search",
    "github.file.read",
    "github.issue.read",
    "github.pr.read",
    "github.repo.read",
  ]);
  assert.equal(registered.find((tool) => tool.name === "github.file.read").inputSchema.additionalProperties, false);
  cleanup();
  assert.equal(disposed.length, 6);
});

test("file read routes through Yellow and Ruby before retention", async () => {
  const calls = [];
  const bridge = new MaopGithubBridge({
    defaultActorId: "fallback-agent",
    async executeYellow(request) {
      calls.push(request);
      return verifiedYellow(request);
    },
    verifyRuby: verifiedRuby,
  });
  const result = await bridge.execute("github.file.read", { path: "package.json" }, { agentId: "deepseek-agent-7" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].actor_id, "deepseek-agent-7");
  assert.equal(calls[0].provider, "github");
  assert.equal(calls[0].permission_class, "READ");
  assert.equal(calls[0].environment, "staging");
  assert.equal(result.ok, true);
  assert.equal(result.ruby_verified, true);
  assert.equal(result.retention_eligible, true);
  assert.deepEqual(result.evidence_refs, ["yellow:ys_run_fixture", "ruby:fixture:pass"]);
});

test("missing Yellow binding fails closed and bridge has no direct GitHub transport", async () => {
  assert.throws(() => new MaopGithubBridge({}), /YELLOW_BINDING_REQUIRED/);
  const source = await readFile(new URL("../dist/bridge.js", import.meta.url), "utf8");
  assert.equal(source.includes("api.github.com"), false);
  assert.equal(source.includes("Authorization"), false);
  assert.equal(source.includes("fetch("), false);
});

test("unsupported fields and credential-like values are rejected before Yellow", async () => {
  let called = 0;
  const bridge = new MaopGithubBridge({ async executeYellow() { called += 1; return verifiedYellow({ input: {} }); } });
  const badField = await bridge.execute("github.file.read", { path: "README.md", token: "secret" });
  assert.equal(badField.ok, false);
  assert.equal(badField.safe_error.code, "INVALID_INPUT");
  const badValue = await bridge.execute("github.code.search", { query: "Bearer abcdefghijklmnopqrstuvwxyz" });
  assert.equal(badValue.ok, false);
  assert.equal(called, 0);
});

test("Yellow failure remains safe and never becomes retention eligible", async () => {
  const bridge = new MaopGithubBridge({
    async executeYellow() {
      return { ok: false, code: "ADAPTER_NOT_IMPLEMENTED", verification: { status: "blocked" }, token: "ghp_abcdefghijklmnop" };
    },
    verifyRuby: verifiedRuby,
  });
  const result = await bridge.execute("github.code.search", { query: "capability" }, { agentId: "deepseek-agent" });
  assert.equal(result.ok, false);
  assert.equal(result.verification_state, "blocked");
  assert.equal(result.retention_eligible, false);
  assert.equal(result.ruby_verified, false);
  assert.equal(result.safe_error.code, "ADAPTER_NOT_IMPLEMENTED");
});

test("cancellation signal is honored before Yellow", async () => {
  let called = 0;
  const controller = new AbortController();
  controller.abort();
  const bridge = new MaopGithubBridge({ async executeYellow() { called += 1; return verifiedYellow({ input: {} }); } });
  const result = await bridge.execute("github.repo.read", {}, { signal: controller.signal, agentId: "deepseek-agent" });
  assert.equal(result.safe_error.code, "CANCELED");
  assert.equal(called, 0);
});


test("input normalization is bounded and does not mutate caller data", async () => {
  const calls = [];
  const bridge = new MaopGithubBridge({
    async executeYellow(request) {
      calls.push(request);
      return verifiedYellow(request);
    },
    verifyRuby: verifiedRuby,
  });

  const original = { path: "  README.md  " };
  const result = await bridge.execute("github.file.read", original);
  assert.equal(result.ok, true);
  assert.equal(original.path, "  README.md  ");
  assert.equal(calls[0].input.path, "README.md");

  const tooLong = await bridge.execute("github.file.read", { path: "x".repeat(501) });
  assert.equal(tooLong.ok, false);
  assert.equal(tooLong.safe_error.code, "INVALID_INPUT");
  assert.equal(calls.length, 1);
});
