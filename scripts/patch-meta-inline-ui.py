from pathlib import Path


def replace_once(path: Path, before: str, after: str) -> None:
    text = path.read_text(encoding='utf-8')
    count = text.count(before)
    if count != 1:
        raise SystemExit(f'PATCH_CONTRACT_FAILED {path}: expected exactly 1 match, got {count}: {before[:120]}')
    path.write_text(text.replace(before, after, 1), encoding='utf-8')


ui = Path('src/UnifiedChat.tsx')
ui_replacements = [
    (
        'type ToolMode = "chat" | "web" | "rag" | "github" | "linear" | "n8n" | "manus" | "live";',
        'type ToolMode = "chat" | "web" | "rag" | "github" | "linear" | "n8n" | "meta" | "manus" | "live";'
    ),
    (
        'async function runInlineTool(mode: "github" | "linear" | "n8n", prompt: string) {',
        'async function runInlineTool(mode: "github" | "linear" | "n8n" | "meta", prompt: string) {'
    ),
    (
        'else if (toolMode === "github" || toolMode === "linear" || toolMode === "n8n") await runInlineTool(toolMode, prompt);',
        'else if (toolMode === "github" || toolMode === "linear" || toolMode === "n8n" || toolMode === "meta") await runInlineTool(toolMode, prompt);'
    ),
    (
        '    { id: "n8n", label: "n8n", sub: liveTools.get("n8n")?.summary || "Workflows", live: toolLive(liveTools.get("n8n")?.state) },\n    { id: "manus",',
        '    { id: "n8n", label: "n8n", sub: liveTools.get("n8n")?.summary || "Workflows", live: toolLive(liveTools.get("n8n")?.state) },\n    { id: "meta", label: "Meta", sub: liveTools.get("meta")?.summary || "Facebook · Instagram · WhatsApp · Threads · Muse", live: toolLive(liveTools.get("meta")?.state) },\n    { id: "manus",'
    ),
]
for before, after in ui_replacements:
    replace_once(ui, before, after)

workflow = Path('.github/workflows/provider-incentive-staging-deploy.yml')
replace_once(
    workflow,
    "              'META_PAGE_ACCESS_TOKEN', 'META_APP_SECRET', 'META_VERIFY_TOKEN',\n",
    "              'META_PAGE_ACCESS_TOKEN', 'META_APP_SECRET', 'META_VERIFY_TOKEN',\n"
    "              'META_ID_PAGE', 'META_ID',\n"
    "              'INSTAGRAM_ACCESS_TOKEN', 'IG_ACCESS_TOKEN', 'INSTAGRAM_BUSINESS_ACCOUNT_ID', 'META_IG_USER_ID',\n"
    "              'WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_TOKEN', 'META_WHATSAPP_ACCESS_TOKEN',\n"
    "              'WHATSAPP_BUSINESS_ACCOUNT_ID', 'WABA_ID', 'WHATSAPP_PHONE_NUMBER_ID',\n"
    "              'THREADS_ACCESS_TOKEN', 'META_THREADS_ACCESS_TOKEN',\n"
)
replace_once(
    workflow,
    '            ([.tools[].id] | sort) == (["github", "linear", "n8n"] | sort) and\n',
    '            ([.tools[].id] | sort) == (["github", "linear", "meta", "n8n"] | sort) and\n',
)

print('PATCH_OK Meta UI + staging deploy contract/runtime bindings')
