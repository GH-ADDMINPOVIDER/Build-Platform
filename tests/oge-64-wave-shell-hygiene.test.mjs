import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const main = readFileSync("src/main.tsx", "utf8");
const legacy = readFileSync("src/LegacyControlSurface.tsx", "utf8");
const sw = readFileSync("public/sw.js", "utf8");

test("OGE-64 canonical entry lazy-loads one legacy boundary", () => {
  assert.match(main, /lazy\(\(\) => import\("\.\/LegacyControlSurface"\)\)/);
  assert.match(main, /<Suspense/);
  assert.match(main, /<LegacyControlSurface \/>/);
  for (const moduleName of [
    "ControlPlaneV2",
    "ChatModelRouter",
    "AppEnhancements",
    "WorkspacePolish",
    "ConnectorPanel",
    "ProviderConnectWizard",
    "GagVault",
    "LiveAssist",
  ]) {
    assert.equal(main.includes('from "./' + moduleName + '"'), false);
    assert.equal(legacy.includes('from "./' + moduleName + '"'), true);
  }
  assert.equal(main.includes('from "./WaveThemeToggle"'), true);
  assert.equal(legacy.includes('ThemeController'), false);
});

test("legacy styles are no longer eagerly imported by main bundle", () => {
  for (const stylesheet of [
    "control-plane-v2.css",
    "wave-control-v3.css",
    "usage-panel.css",
    "connector-panel.css",
    "provider-connect.css",
    "live-assist.css",
    "openai-platform-theme.css",
    "gag-vault.css",
    "dense-mobile.css",
    "mobile-app.css",
    "wave-chat-v3.css",
    "mobile-fixes.css",
  ]) {
    assert.equal(main.includes(stylesheet), false);
    assert.equal(legacy.includes(stylesheet), true);
  }
});

test("canonical routes resolve before legacy fallback", () => {
  assert.match(main, /const legacyOverviewRoute = .*\/overview\/legacy/);
  assert.match(main, /const waveNextRoute = !nativeApp && !legacyOverviewRoute/);
  assert.match(main, /landingRoute[\s\S]*<Landing \/>/);
  assert.match(main, /commandRoute[\s\S]*<WaveNext initialTab="run" surface="command" \/>/);
  assert.match(main, /agentsRoute[\s\S]*<WaveNext initialTab="agent" surface="agents" \/>/);
  assert.match(main, /waveNextRoute[\s\S]*<WaveNext initialTab="run" surface="operate" \/>/);
  assert.match(main, /unifiedChatSurface[\s\S]*<UnifiedChat surface=\{sourceSurface\} \/>/);
});

test("service worker deletes only old WAVE-owned caches", () => {
  assert.match(sw, /const CACHE_PREFIX = "wave-same-mind-shell-"/);
  assert.match(sw, /key\.startsWith\(CACHE_PREFIX\) && key !== CACHE/);
  assert.equal(sw.includes("keys.filter((key) => key !== CACHE)"), false);
});

test("current shell caches canonical doors and remains network-first", () => {
  for (const route of ["/", "/chat", "/app", "/command", "/agents", "/overview"]) {
    assert.equal(sw.includes('"' + route + '"'), true);
  }
  const fetchPosition = sw.indexOf("fetch(request)");
  const cacheLookupPosition = sw.indexOf("caches.match(request)");
  assert.ok(fetchPosition >= 0 && cacheLookupPosition > fetchPosition);
  assert.match(sw, /request\.mode === "navigate"/);
  assert.match(sw, /caches\.match\("\/"\)/);
});
