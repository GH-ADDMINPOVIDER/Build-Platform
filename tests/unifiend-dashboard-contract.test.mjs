import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const main = readFileSync("src/main.tsx", "utf8");
const dashboard = readFileSync("src/UnifiendDashboard.tsx", "utf8");
const css = readFileSync("src/unifiend-dashboard.css", "utf8");

test("Unifiend overview is the dedicated dashboard surface", () => {
  assert.match(main, /const dashboardRoute = !nativeApp && pathname === "\/overview"/);
  assert.match(main, /<UnifiendDashboard \/>/);
  assert.match(main, /import "\.\/unifiend-dashboard\.css"/);
});

test("dashboard exposes exactly three primary execution channels", () => {
  assert.match(dashboard, /id: "chat"/);
  assert.match(dashboard, /id: "command"/);
  assert.match(dashboard, /id: "agents"/);
  assert.match(dashboard, /Three channels/);
  assert.match(dashboard, /href: "\/chat"/);
  assert.match(dashboard, /href: "\/command"/);
  assert.match(dashboard, /href: "\/agents"/);
});

test("dashboard uses real system telemetry surfaces instead of static mock data", () => {
  for (const route of [
    "/api/dashboard",
    "/api/connectors",
    "/api/1lss/status",
    "/api/blue-diamond/registry",
    "/api/violet/status",
  ]) assert.match(dashboard, new RegExp(route.replaceAll("/", "\\/")));
  assert.match(dashboard, /owner-main/);
  assert.match(dashboard, /1LSS_OWNER_MAIN/);
});

test("dashboard keeps Vercel-inspired minimal layout mobile responsive", () => {
  assert.match(css, /--wd-bg:#fafafa/);
  assert.match(css, /wdSidebar/);
  assert.match(css, /wdMetricGrid/);
  assert.match(css, /wdChannelGrid/);
  assert.match(css, /@media\(max-width:760px\)/);
  assert.match(css, /data-og-theme="dark"/);
});
