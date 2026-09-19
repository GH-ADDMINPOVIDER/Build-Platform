import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("canonical 1LSS product direction is seeded into D1/RAG", () => {
  const migration = read("database/migrations/0013_ogenic_1lss_agent_direction.sql");
  assert.match(migration, /OGENIC 1LSS — Auto Session Access/);
  assert.match(migration, /knowledge_documents/);
  assert.match(migration, /agent-load-canonical-direction/);
  assert.match(migration, /deepseek_status/);
});

test("delegated agent surfaces receive canonical D1 context", () => {
  const manus = read("worker/manus-api.ts");
  const runtime = read("worker/openai-runtime.ts");
  const app = read("worker/app-api.ts");
  assert.match(manus, /readCanonicalD1Context/);
  assert.match(runtime, /readCanonicalD1Context/);
  assert.match(app, /readCanonicalD1Context/);
});

test("DeepSeek is registered as planned, not live", () => {
  const providers = read("config/providers.json");
  assert.match(providers, /"id": "deepseek"/);
  assert.match(providers, /"status": "planned"/);
});
