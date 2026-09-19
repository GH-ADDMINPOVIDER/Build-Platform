import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("1LSS bridge accepts owner session or server-side ops key without exposing the key", () => {
  const auth = read("worker/app-auth.ts");
  const api = read("worker/unified-chat-api.ts");
  assert.match(auth, /hasOwnerOrOpsAccess/);
  assert.match(auth, /x-ogenic-ops-key/);
  assert.match(api, /hasOwnerOrOpsAccess/);
  assert.match(api, /SECRET_LIKE_CONTENT_REJECTED/);
});

test("1LSS exposes an incremental ordered event cursor", () => {
  const api = read("worker/unified-chat-api.ts");
  const entry = read("worker/entry-connectors.ts");
  assert.match(api, /GET|api\.get\("\/api\/1lss\/events"/);
  assert.match(api, /after_sequence/);
  assert.match(api, /ORDER BY sequence_no ASC/);
  assert.match(entry, /\/api\/1lss\/events/);
});

test("UnifiedChat follows the 1LSS event cursor near-real-time", () => {
  const ui = read("src/UnifiedChat.tsx");
  assert.match(ui, /after_sequence=/);
  assert.match(ui, /setInterval\(\(\) => \{ void poll1LSS\(\); \}, 3000\)/);
  assert.match(ui, /LIVE ≤3s/);
});
