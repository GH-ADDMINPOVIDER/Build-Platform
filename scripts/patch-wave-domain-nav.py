from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_once(path: str, old: str, new: str) -> None:
    target = ROOT / path
    text = target.read_text(encoding="utf-8")
    if new in text:
        print(f"[WAVE] already patched: {path}")
        return
    if old not in text:
        raise SystemExit(f"[WAVE][BLOCKED] expected text not found in {path}: {old[:100]!r}")
    target.write_text(text.replace(old, new, 1), encoding="utf-8")
    print(f"[WAVE] patched: {path}")


replace_once(
    "src/UnifiedChat.tsx",
    '<div className="ucLineState"><b>1LSS #{String(latestSequence).padStart(4, "0")}</b><span className={d1Enabled ? "on" : "off"}>D1 {d1Enabled ? "●" : "○"}</span></div>',
    '<div className="ucLineState"><b>1LSS #{String(latestSequence).padStart(4, "0")}</b><span className={d1Enabled ? "on" : "off"}>D1 {d1Enabled ? "●" : "○"}</span><span>LIVE ≤3s</span></div>',
)
replace_once(
    "src/UnifiedChat.tsx",
    '<a className="ucWeb" href="/" aria-label="Open OGENIC web home">WEB ↗</a>',
    '<a className="ucWeb" href="/overview" aria-label="Open WAVE Dashboard">DASHBOARD ↗</a>',
)
replace_once(
    "src/ControlPlaneV2.tsx",
    '<div className="cpHeaderActions"><span className="cpStage">STAGING ONLY</span><button onClick={() => void loadDashboard()}>{loading ? "Syncing…" : "↻ Sync"}</button></div>',
    '<div className="cpHeaderActions"><span className="cpStage">STAGING ONLY</span><button onClick={() => { window.location.href = "/chat"; }}>WAVE Chat ↗</button><button onClick={() => void loadDashboard()}>{loading ? "Syncing…" : "↻ Sync"}</button></div>',
)

chat_test = ROOT / "tests/chat-modes-usage-ui.test.mjs"
chat_test.write_text('''import test from "node:test";\nimport assert from "node:assert/strict";\nimport fs from "node:fs";\n\nconst read = (path) => fs.readFileSync(new URL("../" + path, import.meta.url), "utf8");\n\ntest("UnifiedChat exposes canonical WAVE and Agent AI modes", () => {\n  const ui = read("src/UnifiedChat.tsx");\n  assert.match(ui, /label: "WAVE"/);\n  assert.match(ui, /"Agent AI"/);\n  assert.match(ui, /SAME MIND · OGENIC HARNESS · 1LSS/);\n  assert.match(ui, /const \\[experienceMode, setExperienceMode\\] = useState<ExperienceMode>\\("chat-api"\\)/);\n});\n\ntest("Agent AI executes through OpenAI Agent Sessions and returns to owner-main 1LSS", () => {\n  const ui = read("src/UnifiedChat.tsx");\n  const connector = read("worker/connector-app-api.ts");\n  const entry = read("worker/entry-connectors.ts");\n  assert.match(ui, /experienceMode === "agent-ai"/);\n  assert.match(ui, /runAgentAI\\(prompt\\)/);\n  assert.match(ui, /OGENIC HARNESS · Agent Session · 1LSS/);\n  assert.match(ui, /fetch\\("\\/api\\/chat\\/agent"/);\n  assert.doesNotMatch(ui, /experienceMode === "agent-ai"\\) await runHostedTools\\(prompt, "auto"\\)/);\n  assert.match(connector, /conversation_id:\\s*"owner-main"/);\n  assert.match(connector, /session_line:\\s*"1LSS_OWNER_MAIN"/);\n  assert.match(entry, /await stampFunctionTurn/);\n  assert.match(entry, /const ONE_LINE_ID = "owner-main"/);\n});\n\ntest("Usage is placed beside GM and renders real dashboard telemetry", () => {\n  const ui = read("src/ControlPlaneV2.tsx");\n  assert.match(ui, /id: "gm"[\\s\\S]*id: "usage"/);\n  assert.match(ui, /usagePools\\.reduce/);\n  assert.match(ui, /dashboard\\?\\.incentives\\?\\.routing_mode/);\n  assert.match(ui, /dashboard\\?\\.incentives\\?\\.reset_at/);\n  assert.match(ui, /HARNESS_METERED/);\n});\n''', encoding="utf-8")
print("[WAVE] updated current chat-mode contract tests")

agent_test = ROOT / "tests/agent-session-runtime-contract.test.mjs"
agent_text = agent_test.read_text(encoding="utf-8")
old_route = '  assert.match(entry, /pathname === "\\/api\\/chat\\/functions" \\|\\| pathname === "\\/api\\/chat\\/agent"/);'
new_route = '  assert.match(entry, /pathname === "\\/api\\/chat\\/agent"/);\n  assert.match(entry, /pathname === "\\/api\\/chat\\/functions"/);'
if old_route in agent_text:
    agent_test.write_text(agent_text.replace(old_route, new_route, 1), encoding="utf-8")
elif new_route not in agent_text:
    raise SystemExit("[WAVE][BLOCKED] agent route contract shape changed")
print("[WAVE] updated split agent/function route contract")

replace_once(
    ".github/workflows/provider-incentive-staging-deploy.yml",
    "  STAGING_URL: https://ogenic-phase-vi-staging.tawatchaisamornrum11.workers.dev",
    "  STAGING_URL: https://wave.ogenicchocolate.com",
)
replace_once(
    ".github/workflows/provider-incentive-staging-deploy.yml",
    "    runs-on: ubuntu-latest",
    "    runs-on: [self-hosted, linux, x64, wave]",
)

print("[WAVE] domain/nav patch ready")
