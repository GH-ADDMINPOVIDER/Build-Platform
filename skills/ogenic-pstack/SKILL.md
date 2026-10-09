---
name: ogenic-pstack
description: MIT-attributed selected pstack workflow recipes adopted to existing WAVE agents, not the native Cursor plugin.
---

# OGENIC pstack workflow adapter
Upstream: https://github.com/cursor/plugins/tree/main/pstack
MIT Copyright (c) 2026 Lauren Tan; full license in third_party/pstack/LICENSE.
This is the OGENIC implementation of selected prompting playbooks, not installed vendor Cursor plugin.
Read config/pstack-workflows.json. WAVE Tool Dock chooses one of investigation (read-only), session-pickup (verified prior 1LSS history), bug-fix (reproduce and independently Ruby-verify), or babysit (PR/CI audit). A button only prepares a draft; **Send** uses existing WAVE model quota and policy checks.
Always retrieve canonical owner-main / 1LSS, source SHA and issue evidence; never assume provider-model cross-session memory. Yellow retains sole execution approval, Ruby verifies, Green retains source-matched evidence. No automatic calls to paid providers, no changes to main/prod/Candy/D1 schema/secrets. Unknown native Cursor-only dependencies are not simulated.

## Mobile @pstack command (OGE-109)
Typing `@pstack` or `/pstack` as a whole draft opens the WAVE local guided-workflow picker without posting chat messages or consuming any AI token. Typing `@pstack investigation`, `@pstack session-pickup`, `@pstack bug-fix` or `@pstack babysit` prepares that existing preset only. Any remaining task text is retained in the draft. No model call occurs until the owner presses Send AGAIN. If an unknown subcommand is supplied, open the picker with text preserved for refinement. Actual native Cursor pstack installation is still NOT provided.

## iPhone no-stacking UX after observed ATHENA_TOOL_LOOP_LIMIT
Select exactly ONE pstack preset; selection fills no template body. Type a concrete task separately. Changing presets removes any exact old known preset paragraphs and leaves user text. Sending a selected workflow without a task must be blocked locally, before AI tool calls. Maintain ATHENA's bounded tool-loop safety; do not increase max iterations. A normal completed provider turn is needed for any future claim that an agent executed this workflow.
