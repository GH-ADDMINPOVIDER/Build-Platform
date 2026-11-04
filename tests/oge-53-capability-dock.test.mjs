import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL("../" + path, import.meta.url), "utf8");
const chat = read("src/UnifiedChat.tsx");
const unifiend = read("src/UnifiendNext.tsx");
const css = read("src/unified-chat.css");

test("OGE-53 capability dock searches only real runtime-backed execution rows", () => {
  assert.match(chat, /capabilityQuery/);
  assert.match(chat, /Search capabilities/);
  assert.match(chat, /visibleTools = toolRows\.filter\(\(row\) => row\.live/);
  assert.match(chat, /toolLive\(/);
  assert.match(chat, /No matching executable tool or pstack prompt preset/);
});

test("connector states are visible without becoming fake execution buttons", () => {
  assert.match(chat, /visibleConnectorStates/);
  assert.match(chat, /CONNECTION STATES/);
  assert.match(chat, /String\(row\.state \|\| "NOT_MEASURED"\)\.toUpperCase\(\)/);
  assert.doesNotMatch(chat, /setToolMode\(row\.id as ToolMode\)/);
});

test("capability navigation targets real Unifiend surfaces", () => {
  assert.match(chat, /href="\/overview\?tab=connections">Manage Connections/);
  assert.match(chat, /href="\/agents">Agents/);
  assert.match(chat, /href="\/overview\?tab=run">Runtime/);
  assert.match(unifiend, /URLSearchParams\(window\.location\.search\)/);
  assert.match(unifiend, /connections/);
});

test("selected capability is explicit and removable before send", () => {
  assert.match(chat, /toolMode !== "chat"[\s\S]*ucActiveTool/);
  assert.match(chat, /setToolMode\("chat"\)/);
  assert.match(chat, /toolMode === row\.id \? "active"/);
});

test("dock keeps mobile-first responsive behavior", () => {
  assert.match(css, /\.ucCapabilitySearch/);
  assert.match(css, /\.ucCapabilityNav/);
  assert.match(css, /@media \(max-width:700px\)\{\.ucCapabilityNav\{grid-template-columns:1fr\}/);
});

test("V1 does not fabricate unavailable Skills Projects Plugins MCP or Functions execution buttons", () => {
  const dock = chat.slice(chat.indexOf('<div className="ucDockHead"><div><b>Capabilities</b>'));
  assert.doesNotMatch(dock, />Skills</);
  assert.doesNotMatch(dock, />Projects</);
  assert.doesNotMatch(dock, />Plugins</);
  assert.doesNotMatch(dock, />MCP</);
  assert.doesNotMatch(dock, />Functions</);
});
