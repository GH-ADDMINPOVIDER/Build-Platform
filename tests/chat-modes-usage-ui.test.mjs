import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("UnifiedChat exposes honest ChatGPT, Chat API and Agent AI modes", () => {
  const ui = read("src/UnifiedChat.tsx");
  assert.match(ui, /"ChatGPT"/);
  assert.match(ui, /"Chat API"/);
  assert.match(ui, /"Agent AI"/);
  assert.match(ui, /ChatGPT · Bridge pending/);
  assert.match(ui, /const \[experienceMode, setExperienceMode\] = useState<ExperienceMode>\("chat-api"\)/);
});

test("Agent AI executes through the existing functions path and returns to owner-main 1LSS", () => {
  const ui = read("src/UnifiedChat.tsx");
  const entry = read("worker/entry-connectors.ts");
  assert.match(ui, /experienceMode === "agent-ai"/);
  assert.match(ui, /runHostedTools\(prompt, "auto"\)/);
  assert.match(ui, /owner-main · 1LSS/);
  assert.match(ui, /fetch\("\/api\/chat\/functions"/);
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
