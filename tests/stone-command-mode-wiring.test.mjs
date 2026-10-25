// CP-055..057 / OGE-131 — additive 15-mode ingress smoke, SOURCE ONLY.
// Exercises real TypeScript normalizer. No WAVE request, secret, dispatch, host or D1 mutation.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadTs } from "./_load-ts.mjs";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const registry = JSON.parse(read("config/wave-command-mode-wire.v1.json"));
const { connectorModes, normalizeConnectorEnvelope } = await loadTs("worker/connector-endpoint-api.ts");
const entry = read("worker/entry-yellow-stone.ts");
const dispatch = read("worker/wave-command-dispatch.ts");
const workflow = read(".github/workflows/wave-command-consumer.yml");

const ownerBound = (source_mode, mode="read") => ({
  transport: "agent_sign_command_run",
  source_mode,
  command: "bounded staging task evidence smoke",
  capability: "codex_selfhost",
  provider: "openai",
  mode,
  environment: "staging",
});

test("all 15 pre-existing categories attach as source provenance to ONE signed command ingress", () => {
  assert.equal(registry.source_modes.length, 15);
  assert.deepEqual(registry.source_modes, connectorModes.map((item) => item.id));
  for (const source_mode of registry.source_modes) {
    const r = normalizeConnectorEnvelope(ownerBound(source_mode));
    assert.equal(r.ok, true, source_mode);
    assert.equal(r.transport, "agent_sign_command_run", source_mode);
    assert.equal(r.source_mode, source_mode, source_mode);
    assert.equal(r.delegated.capability, "codex_selfhost", source_mode);
    assert.equal(r.delegated.provider, "openai", source_mode);
    assert.equal(r.delegated.environment, "staging", source_mode);
    // UNTRUSTED source label is dropped before canonical ATHENA/Yellow admission.
    assert.equal(Object.hasOwn(r.delegated, "source_mode"), false, source_mode);
    assert.equal(Object.hasOwn(r.delegated, "approval"), false, source_mode);
  }
});

test("all four existing WAVE command modes can use the same ingress without new endpoints", () => {
  for (const mode of registry.wave_command_modes) {
    const r = normalizeConnectorEnvelope(ownerBound("mcp", mode));
    assert.equal(r.ok, true, mode);
    assert.equal(r.delegated.mode, mode, mode);
  }
  assert.equal(registry.existing_ingress, "POST /api/connector-endpoint/v1/command");
  assert.equal(registry.canonical_path, "POST /api/wave/command");
  assert.match(entry, /normalizeConnectorEnvelope\(data\)/);
  assert.match(entry, /target\.pathname = "\/api\/wave\/command"/);
  assert.match(entry, /return athenaGuardedCommand\(forwarded, env, ctx\)/);
  assert.match(entry, /hasOwnerSession\(request, env\)/);
});

test("legacy direct mode, identity and unverified adapter guards remain untouched", () => {
  for (const transport of ["token", "secret", "credential"]) {
    const r = normalizeConnectorEnvelope({ ...ownerBound("mcp"), transport });
    assert.equal(r.ok, false);
    assert.equal(r.code, "IDENTITY_REFERENCE_ONLY_NO_SECRET_EXPORT");
  }
  for (const transport of ["mcp","n8n","npm","sdk","npx_cli","a2a_agent_relay","webhook_event_calling","function_tool_calling"]) {
    const r = normalizeConnectorEnvelope({ ...ownerBound("mcp"), transport });
    assert.equal(r.ok, false);
    assert.equal(r.code, "MODE_ADAPTER_NOT_VERIFIED_USE_EXISTING_SAFE_ROUTE");
  }
  for (const invalid of [
    {source_mode:"unknown_transport"},
    {environment:"production"},
    {provider:"github"},
    {token:"leak"},
    {approval:{confirmed:true,approval_id:"arbitrary"}},
  ]) {
    const r=normalizeConnectorEnvelope({...ownerBound("mcp"),...invalid});
    assert.equal(r.ok,false,JSON.stringify(invalid));
  }
});

test("real dispatch target and existing self-host lane are not changed", () => {
  assert.match(dispatch, /api\.github\.com\/repos\/Wave-Runner-2\/Build-Platform\/actions\/workflows\/wave-command-consumer\.yml\/dispatches/);
  assert.doesNotMatch(dispatch, /api\.github\.com\/repos\/Ogenicchocolate21debug\/Build-Platform/);
  assert.match(workflow, /runs-on: \[self-hosted, linux, x64, wave\]/);
  assert.match(workflow, /Infisical\/secrets-action@v1\.0\.9/);
  assert.match(workflow, /scripts\/wave-terminal-solo\.sh/);
  assert.equal(registry.runner,"wave-runner-01");
  assert.equal(registry.physical_host,"OCIAN-S HOST");
  assert.equal(registry.executor,"CODEX-TMN");
});
