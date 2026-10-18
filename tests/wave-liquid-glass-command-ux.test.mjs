import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const read = (path) => fs.readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("command simple mode accepts natural text with no path and queues only behind owner approval", () => {
  const ui = read("src/WaveNext.tsx");
  assert.match(ui, /const path = advanced \? resourcePath\.trim\(\) : ""/);
  assert.match(ui, /requestBody\.capability = "codex_selfhost"/);
  assert.match(ui, /requestBody\.provider = "openai"/);
  assert.match(ui, /response\.status === 202 && body\.code === "OWNER_APPROVAL_REQUIRED"/);
  assert.match(ui, /body\.approval\?\.approval_id/);
  assert.match(ui, /approval: \{ confirmed: true, approval_id: approved\.id \}/);
  assert.match(ui, /QUEUED ไม่ใช่ DONE/);
});

test("command can search @ agents and optionally open advanced paths", () => {
  const ui = read("src/WaveNext.tsx");
  assert.match(ui, /const MENTION_PRESETS/);
  assert.match(ui, /const activeMention = command\.match/);
  assert.match(ui, /mentionChoices/);
  assert.match(ui, /violet\.agents/);
  assert.match(ui, /aria-label="แนะนำเอเจ้น ทีม และสกิล"/);
  assert.match(ui, /COMMAND_VIEW_KEY/);
  assert.match(ui, /Optional GitHub file path for verified READ/);
});

test("glass themes reuse existing WAVE theme state and original landing content", () => {
  const landing = read("src/Landing.tsx");
  const glass = read("src/wave-theme.css");
  const theme = read("src/WaveThemeToggle.tsx");
  assert.match(landing, /ONE CONTEXT/);
  assert.match(landing, /GREEN STONE/);
  assert.match(landing, /YELLOW STONE/);
  assert.match(landing, /OWNER DIAGRAM SLOT/);
  assert.match(landing, /aria-expanded=\{showArchitecture\}/);
  assert.match(landing, /stoneLegend\.map/);
  for (const label of ["BLUE DIAMOND","VIOLET STONE","RUBY STONE","STONE RUNNER","RULE STONE"]) {
    assert.ok(landing.includes(label), label);
  }
  assert.match(glass, /WAVE LIQUID GLASS CLEAR 2026/);
  assert.match(glass, /backdrop-filter:\s*blur/);
  assert.match(glass, /data-og-theme="light"/);
  assert.match(glass, /data-og-theme="dark"/);
  assert.match(theme, /WAVE_THEME_KEY/);
});

test("existing signed session renews without saving Owner key or bypassing authentication", () => {
  const auth = read("worker/app-auth.ts");
  const bridge = read("src/main.tsx");
  assert.match(auth, /api\.post\("\/api\/session\/refresh"/);
  assert.match(auth, /await hasOwnerSession\(c\.req\.raw, c\.env\)/);
  assert.match(auth, /const token = await issueSession\(configured\)/);
  assert.match(auth, /HttpOnly; Secure; SameSite=Strict/);
  assert.match(bridge, /if \(state\.authenticated === true\)/);
  assert.match(bridge, /fetch\("\/api\/session\/refresh"/);
  assert.match(bridge, /!navigator\.onLine/);
  assert.match(bridge, /20 \* 60 \* 1000/);
  assert.doesNotMatch(bridge, /localStorage\.setItem\([^)]*ownerKey/);
});
