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
  assert.ok(toggle.includes('WAVE_THEME_KEY = "ogenic.webdev.theme.v1"'));
  assert.ok(toggle.includes("localStorage.getItem(WAVE_THEME_KEY)"));
  assert.ok(toggle.includes("localStorage.setItem(WAVE_THEME_KEY, theme)"));
  assert.ok(toggle.includes("root.dataset.ogTheme = theme"));
  assert.ok(toggle.includes("root.style.colorScheme = theme"));
});

test("explicit user choice wins and cross-tab storage events synchronize state", () => {
  assert.ok(toggle.includes('saved === "light" || saved === "dark"'));
  assert.ok(toggle.includes("matchMedia"));
  assert.ok(toggle.includes('window.addEventListener("storage", sync)'));
  assert.ok(toggle.includes("event.key !== WAVE_THEME_KEY"));
  assert.ok(toggle.includes("setTheme(event.newValue)"));
});

test("one global toggle is mounted above canonical and lazy legacy surfaces", () => {
  assert.ok(main.includes('import WaveThemeToggle from "./WaveThemeToggle"'));
  assert.equal((main.match(/<WaveThemeToggle \/>/g) || []).length, 1);
  assert.ok(main.includes("const LegacyControlSurface = lazy"));
  assert.equal(/WaveThemeToggle|ThemeController/.test(legacy), false);
});

test("WAVE Chat, Web and Operate expose explicit light and dark selectors", () => {
  for (const [name, css] of [["chat", chatCss], ["web", webCss], ["operate", operateCss]]) {
    assert.ok(css.includes(':root[data-og-theme="light"]'), name + " missing explicit light theme");
    assert.ok(css.includes(':root[data-og-theme="dark"]'), name + " missing explicit dark theme");
  }
});

test("theme toggle is mobile safe and accessible", () => {
  assert.ok(toggle.includes("aria-label="));
  assert.ok(toggle.includes("Switch to"));
  assert.ok(themeCss.includes("safe-area-inset-top"));
  assert.ok(themeCss.includes("@media(max-width:700px)"));
  assert.ok(themeCss.includes("backdrop-filter:blur(18px)"));
});
