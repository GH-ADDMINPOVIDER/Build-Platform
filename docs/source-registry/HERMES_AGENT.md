# Hermes Agent — pinned upstream source

**Owner-requested source intake, not runtime installation.**

- Canonical upstream: https://github.com/NousResearch/hermes-agent
- Exact upstream commit: `bda3a363e9695e3f63fce4a7ca85ba17b5fecb61`
- Upstream license: MIT (preserve upstream `LICENSE`)
- Git source path: `third_party/hermes-agent` as an exact-SHA **Git submodule**.
- WAVE operational identity: `GH_ADDMIN_POVIDER` / `Wave-Runner-2/Build-Platform`.
- Classification: `CODE_GREY` = source availability ONLY, not installed/authorized/online/E2E.

## Retrieval

`git -c protocol.file.allow=never submodule update --init --depth 1 third_party/hermes-agent`

GitHub content import only: no Railway, n8n, OCIAN-S host or `curl | bash` needed.
Do not execute `scripts/install.sh` during source intake; source is third-party/untrusted pending normal code review and bounded staging acceptance.
Keep `.gitmodules` and gitlink pinned. Do not auto-update from upstream main or follow HEAD silently.
No provider credential, sudo, paid inference, persistent daemon, workflow registration or deployment is authorized by this source intake.

## Checkpoint semantics

This record proves the **upstream SHA was linked** in GH2 and can be fetched by a git client configured to initialize submodules. It does NOT duplicate the full upstream bytes into the GH2 Git object database. Do not label as code-copy/mirror E2E.
Retain owner original seven-workstream priority; Hermes is an additive source dependency/reference only.
