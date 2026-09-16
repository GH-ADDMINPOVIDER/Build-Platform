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
        '    { id: "meta", label: "Meta", sub: liveTools.get("meta")?.summary || "Facebook · Instagram · WhatsApp · Threads · Muse", live: toolLive(liveTools.get("meta")?.state) },',
        '    { id: "meta", label: "Meta Facebook", sub: liveTools.get("meta")?.summary || "Facebook Page · Messenger · Instagram optional", live: toolLive(liveTools.get("meta")?.state) },'
    ),
]
changed = False
for before, after in replacements:
    if before in text:
        if text.count(before) != 1:
            raise SystemExit(f'PATCH_CONTRACT_FAILED duplicate old pattern: {before[:120]}')
        text = text.replace(before, after, 1)
        changed = True
    elif after in text:
        continue
    else:
        raise SystemExit(f'PATCH_CONTRACT_FAILED neither old nor new pattern found: {before[:120]}')
if changed:
    path.write_text(text, encoding='utf-8')
    print('PATCH_OK Meta UI scoped to Facebook; Instagram optional')
else:
    print('PATCH_OK already applied; no changes')
