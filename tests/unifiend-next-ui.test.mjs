import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("Unifiend NEXT owns operate command and agents while legacy remains rollback", () => {
  const main = read("src/main.tsx");
  const ui = read("src/UnifiendNext.tsx");
  assert.match(main, /pathname === "\/overview"/);
  assert.match(main, /pathname === "\/overview\/next"/);
  assert.match(main, /pathname === "\/overview\/legacy"/);
  assert.match(main, /pathname === "\/command"/);
  assert.match(main, /pathname === "\/agents"/);
  assert.match(main, /<UnifiendNext initialTab="run" surface="operate" \/>/);
  assert.match(main, /<UnifiendNext initialTab="run" surface="command" \/>/);
  assert.match(main, /<UnifiendNext initialTab="agent" surface="agents" \/>/);
  assert.match(main, /<LegacyControlSurface \/>/);
  assert.doesNotMatch(main, /<ControlPlaneV2 \/>/);
  assert.match(ui, /href="\/overview"/);
  assert.match(ui, /href="\/command"/);
  assert.match(ui, /href="\/agents"/);
});

test("Unifiend NEXT exposes run-first primary sections and real runtime endpoints", () => {
  const ui = read("src/UnifiendNext.tsx");
  for (const section of ["run", "agent", "session", "connections", "approvals", "history"]) {
    assert.match(ui, new RegExp(`\\"${section}\\"`));
  }
  for (const endpoint of ["/api/dashboard", "/api/connectors", "/api/openai/selfhost/readiness", "/api/1lss/status", "/api/1lss/sessions?limit=12"]) {
    assert.match(ui, new RegExp(endpoint.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("SSH fallback keeps private keys local and uses verified runner metadata only", () => {
  const ui = read("src/UnifiendNext.tsx");
  assert.match(ui, /wave-runner-01/);
  assert.match(ui, /165\.232\.174\.32/);
  assert.match(ui, /const SSH_USER = "wave"/);
  assert.match(ui, /private key stays on the phone/i);
  assert.doesNotMatch(ui, /BEGIN (RSA|OPENSSH|EC) PRIVATE KEY/);
});

test("Unifiend NEXT command handoff reuses the existing composer draft store", () => {
  const ui = read("src/UnifiendNext.tsx");
  const composer = read("src/ComposerAttachments.tsx");
  assert.match(ui, /ogenic\.wave-next\.handoff\.v1/);
  assert.match(composer, /ogenic\.wave-next\.handoff\.v1/);
  assert.match(composer, /store\.setText\(handoff\)/);
});
