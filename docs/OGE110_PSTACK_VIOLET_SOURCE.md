# OGE-110 — pstack source belongs to Violet Stone

**Violet Stone**: owns selection/orchestration of the complete pstack portable skill source set. **Blue**: real agent identity. **Yellow**: sole authority for execution, billable calls and tools. **Ruby**: independent verifier. **Green/1LSS**: only canonical memory.

Official pstack: https://github.com/cursor/plugins/tree/main/pstack (MIT). Portable source (MIT, not affiliated): https://github.com/backnotprop/pstack at pinned commit `3a604672c46cd8187d2b19980eae0a34f9f91138`.

GitHub Actions `.github/workflows/oge-110-violet-pstack-intake.yml` checks out the pinned mirror; local first-party import script copies the entire portable source tree (skills, agents, docs, automation examples and LICENSE) under `third_party/pstack-portable/`; it also places 51 Skills in `.agents/skills/` for compatible **repo-based coding agents**. Scripts are copied as non-executable data, never invoked. The workflow pins the commit and rejects a stale staging HEAD. It does not deploy code itself, send prompts to external models, modify D1, or install Cursor iOS.

The generated `config/pstack-full-catalog.json` must explicitly say `NOT_DISPATCHED`. Having all 51 skill definitions is **complete source import**, not 51 verified runtime operations. Cursor-native `Task` / cloud subagent and extra `cursor-team-kit` dependencies are NOT automatically available to Unifiend. Actual Unifiend multi-agent execution remains under existing Violet/Blue + Yellow permission and Ruby verification, with existing Green/1LSS only.

OGE-109's four guided Unifiend UI presets remain separate from this source intake. Do not treat standalone skills as a second Yellow Control Panel. Never force paid Cursor/mobile subscription or computer usage.
