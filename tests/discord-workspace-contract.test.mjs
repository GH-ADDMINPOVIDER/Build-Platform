import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const api = read("../worker/discord-api.ts");
const entry = read("../worker/entry-yellow-stone.ts");
const bindings = JSON.parse(read("../config/staging-runtime-bindings.json"));
const wrangler = JSON.parse(read("../wrangler.jsonc"));
const ui = read("../src/DiscordWorkspacePanel.tsx");
const dashboard = read("../src/WaveDashboard.tsx");

test("Discord endpoints require authenticated owner or ops access", () => {
  assert.match(api, /hasOwnerOrOpsAccess/);
  assert.match(api, /hasOwnerSession/);
  assert.match(api, /ORIGIN_DENIED/);
});

test("Discord credentials stay server-side and enter the Worker runtime binding bundle", () => {
  assert.ok(bindings.connector_optional.includes("DISCORD_TOKEN"));
  assert.equal(wrangler.vars.DISCORD_GUILD_ID, "1558544234082996338");
  assert.match(api, /Authorization", "Bot " \+ token/);
  assert.doesNotMatch(ui, /DISCORD_TOKEN\s*=/);
});

test("Discord status, channels, messages and workspace provisioning are wired to WAVE", () => {
  assert.match(entry, /createDiscordApi/);
  assert.match(entry, /pathname\.startsWith\("\/api\/discord\/"\)/);
  assert.match(api, /\/api\/discord\/status/);
  assert.match(api, /\/api\/discord\/channels/);
  assert.match(api, /\/api\/discord\/workspace\/bootstrap/);
  assert.match(api, /allowed_mentions: \{ parse: \[\] \}/);
});

test("workspace bootstrap is repeat-safe and never moves or deletes existing rooms", () => {
  assert.match(api, /const WORKSPACE: WorkspaceGroup\[\]/);
  assert.match(api, /EXISTS_IN_DIFFERENT_CATEGORY/);
  assert.match(api, /retry_safe: true/);
  assert.doesNotMatch(api, /method:\s*"DELETE"/);
});

test("WAVE UI supports manual workspace setup, message review and image attachment previews", () => {
  assert.match(dashboard, /DiscordWorkspacePanel/);
  assert.match(ui, /Create Notion-style workspace/);
  assert.match(ui, /\/api\/discord\/channels\//);
  assert.match(ui, /attachment\.proxy_url \|\| attachment\.url/);
  assert.match(ui, /sendMessage/);
});
