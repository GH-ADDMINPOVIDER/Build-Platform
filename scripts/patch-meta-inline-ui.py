from pathlib import Path

path = Path('src/UnifiedChat.tsx')
text = path.read_text(encoding='utf-8')
replacements = [
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
for before, after in replacements:
    count = text.count(before)
    if count != 1:
        raise SystemExit(f'PATCH_CONTRACT_FAILED expected exactly 1 match, got {count}: {before[:120]}')
    text = text.replace(before, after, 1)
path.write_text(text, encoding='utf-8')
print('PATCH_OK Meta inline tool enabled in UnifiedChat')
