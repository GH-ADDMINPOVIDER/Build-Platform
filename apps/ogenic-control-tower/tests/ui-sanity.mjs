import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(join(root, "public", "control-tower.html"), "utf8");
for (const text of ["ASK OGENIC", "AUTO ROUTER", "Capability Index", "Buyer Intent Radar", "Agents / Connectors", "Recent Runs", "Approval Inbox", "Observability"]) {
  assert.ok(html.includes(text), `missing UI section: ${text}`);
}
assert.ok(html.includes('name="viewport"'), "mobile viewport missing");
assert.ok(html.includes('tools/call'), "MCP Apps tools/call bridge missing");
assert.ok(html.includes('ui/initialize'), "MCP Apps initialization request missing");
assert.ok(html.includes('ui/notifications/initialized'), "MCP Apps initialized notification missing");
assert.ok(html.includes('ui/notifications/tool-result'), "MCP Apps tool-result listener missing");
assert.ok(html.includes('window.openai?.callTool'), "ChatGPT compatibility fallback missing");
assert.ok(!/>\s*(Online|Ready)\s*</i.test(html), "UI must not hard-code Online/Ready state");
assert.ok(html.includes("STAGING · UNVERIFIED"), "staging environment must begin unverified");
assert.ok(html.includes("No contacts or intent are fabricated"), "Buyer Intent empty-state safeguard missing");
assert.ok(html.includes("pending_human_approval"), "Human Approval pending state missing");

const vercel = JSON.parse(readFileSync(join(root, "vercel.json"), "utf8"));
assert.ok(vercel.rewrites.some((route) => route.source === "/" && route.destination === "/api/health"), "Vercel root health rewrite missing");
console.log("UI sanity PASS");
