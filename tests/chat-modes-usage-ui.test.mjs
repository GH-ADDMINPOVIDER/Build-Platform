import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("UnifiedChat exposes canonical Unifiend and Agent AI modes", () => {
  const ui = read("src/UnifiedChat.tsx");
  assert.match(ui, /label: "Unifiend"/);
  assert.match(ui, /"Agent AI"/);
  assert.match(ui, /SAME MIND · OGENIC HARNESS · 1LSS/);
  assert.match(ui, /const \[experienceMode, setExperienceMode\] = useState<ExperienceMode>\("chat-api"\)/);
});

test("Agent AI executes through OpenAI Agent Sessions and returns to owner-main 1LSS", () => {
  const ui = read("src/UnifiedChat.tsx");
  const connector = read("worker/connector-app-api.ts");
  const entry = read("worker/entry-connectors.ts");
  assert.match(ui, /experienceMode === "agent-ai"/);
  assert.match(ui, /runAgentAI\(effectivePrompt\)/);
  assert.match(ui, /runChat\(effectivePrompt\)/);
  assert.match(ui, /const effectivePrompt = selectedPstackPreset/);
  assert.match(ui, /if \(selectedPstackPreset && !pstackTask\)/);
  assert.match(ui, /OGENIC HARNESS · Agent Session · 1LSS/);
  assert.match(ui, /fetch\("\/api\/chat\/agent"/);
  assert.doesNotMatch(ui, /experienceMode === "agent-ai"\) await runHostedTools\(prompt, "auto"\)/);
  assert.match(connector, /conversation_id:\s*"owner-main"/);
  assert.match(connector, /session_line:\s*"1LSS_OWNER_MAIN"/);
  assert.match(entry, /await stampFunctionTurn/);
  assert.match(entry, /const ONE_LINE_ID = "owner-main"/);
});

test("Usage is placed beside GM and renders real dashboard telemetry", () => {
  const ui = read("src/ControlPlaneV2.tsx");
  assert.match(ui, /id: "gm"[\s\S]*id: "usage"/);
  assert.match(ui, /usagePools\.reduce/);
  assert.match(ui, /dashboard\?\.incentives\?\.routing_mode/);
  assert.match(ui, /dashboard\?\.incentives\?\.reset_at/);
  assert.match(ui, /HARNESS_METERED/);
});
