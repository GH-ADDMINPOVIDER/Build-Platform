import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const base = new URL("../packages/maop-github-harness/", import.meta.url);
const plugin = await readFile(new URL("src/plugin.ts", base), "utf8");
const bridge = await readFile(new URL("src/bridge.ts", base), "utf8");
const tools = await readFile(new URL("src/tools.ts", base), "utf8");

test("OGE-43 bridge exposes only the six normalized read capabilities", () => {
  for (const capability of [
    "github.repo.read",
    "github.file.read",
    "github.code.search",
    "github.issue.read",
    "github.pr.read",
    "github.actions.status",
  ]) assert.match(tools, new RegExp(capability.replaceAll(".", "\\.")));
  assert.doesNotMatch(tools, /github\.(?:file\.write|issue\.create|merge|delete|deploy)/);
});

test("OGE-43 plugin uses Harness tools injection and Yellow-only bridge", () => {
  assert.match(plugin, /inject\s*=\s*\["tools"\]/);
  assert.match(plugin, /ctx\.tools\.register\(tool\)/);
  assert.match(plugin, /defineTool\(/);
  assert.match(bridge, /executeYellow/);
  assert.doesNotMatch(bridge, /api\.github\.com/);
  assert.doesNotMatch(bridge, /Authorization/);
  assert.doesNotMatch(bridge, /fetch\s*\(/);
});

test("OGE-43 preserves Ruby-before-Green retention gating", () => {
  assert.match(bridge, /verifyRuby/);
  assert.match(bridge, /retention_eligible:\s*ok\s*&&\s*state\s*===\s*"verified"\s*&&\s*rubyVerified/);
});
