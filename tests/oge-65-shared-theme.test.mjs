import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const toggle = readFileSync("src/WaveThemeToggle.tsx", "utf8");
const themeCss = readFileSync("src/wave-theme.css", "utf8");
const main = readFileSync("src/main.tsx", "utf8");
const legacy = readFileSync("src/LegacyControlSurface.tsx", "utf8");
const chatCss = readFileSync("src/unified-chat.css", "utf8");
const webCss = readFileSync("src/landing.css", "utf8");
const operateCss = readFileSync("src/wave-next.css", "utf8");

test("OGE-65 uses one persisted shared theme key and applies it to document root", () => {
  assert.match(toggle, /WAVE_THEME_KEY = "ogenic\\.webdev\\.theme\\.v1"/);
  assert.match(toggle, /localStorage\\.getItem\\(WAVE_THEME_KEY\\)/);
  assert.match(toggle, /localStorage\\.setItem\\(WAVE_THEME_KEY, theme\\)/);
  assert.match(toggle, /root\\.dataset\\.ogTheme = theme/);
  assert.match(toggle, /root\\.style\\.colorScheme = theme/);
});

test("explicit user choice wins and cross-tab storage events synchronize state", () => {
  assert.match(toggle, /saved === "light" \\|\\| saved === "dark"/);
  assert.match(toggle, /matchMedia/);
  assert.match(toggle, /window\\.addEventListener\\("storage", sync\\)/);
  assert.match(toggle, /event\\.key !== WAVE_THEME_KEY/);
  assert.match(toggle, /setTheme\\(event\\.newValue\\)/);
});

test("one global toggle is mounted above canonical and lazy legacy surfaces", () => {
  assert.match(main, /import WaveThemeToggle from "\\.\\/WaveThemeToggle"/);
  assert.equal((main.match(/<WaveThemeToggle \\/>/g) || []).length, 1);
  assert.match(main, /const LegacyControlSurface = lazy/);
  assert.doesNotMatch(legacy, /WaveThemeToggle|ThemeController/);
});

test("WAVE Chat, Web and Operate expose explicit light and dark selectors", () => {
  for (const [name, css] of [["chat", chatCss], ["web", webCss], ["operate", operateCss]]) {
    assert.match(css, /:root\\[data-og-theme="light"\\]/, `${name} missing explicit light theme`);
    assert.match(css, /:root\\[data-og-theme="dark"\\]/, `${name} missing explicit dark theme`);
  }
});

test("theme toggle is mobile safe and accessible", () => {
  assert.match(toggle, /aria-label=/);
  assert.match(toggle, /Switch to/);
  assert.match(themeCss, /safe-area-inset-top/);
  assert.match(themeCss, /@media\\(max-width:700px\\)/);
  assert.match(themeCss, /backdrop-filter:blur\\(18px\\)/);
});
