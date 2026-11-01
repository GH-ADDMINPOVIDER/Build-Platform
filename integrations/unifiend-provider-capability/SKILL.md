---
name: unifiend-provider-capability
description: Recover Unifiend GH-ADDMINPOVIDER capabilities, prepare Copilot ACP tools, inspect SSH readiness and preserve evidence when continuing work or moving chats.
---

# Unifiend Capability | GH-ADDMINPOVIDER

Read `references/tools-and-ssh.md` and `references/provider-contract.json` first. A skill is instructions, not an authentication grant.

- Reuse GH-ADDMINPOVIDER, Infisical, Linear and Ocian-S-Host. Preserve existing provider and DeepSeek routes.
- Separate capability, adapter, role and permissions. Distinguish registered, installed, authenticated, quota available and successfully invoked.
- Check source, Linear and D1 before operational changes; append checkout evidence to the existing certificate Sheet. Preserve historical green/orange records. Report unavailable checkpoints; never imply local output is D1/ATHENA writeback.
- Use only the required mode on demand. Do not install all agents or start permanent services merely to register capabilities.
- Run `python3 scripts/tools_server.py --print-config` for local stdio MCP configuration. The four tools inspect the contract, Copilot help, the current SSH agent, and prepare argv. They do not execute prompts or SSH.
- Set `UNIFIEND_WORKTREE` to an existing authorized absolute worktree for planning. Use the existing tested mode manager and authorized execution adapter for actual work. Returned argv is not execution evidence.
- An optional `unifiend_ssh_status` call with `{"probe":true}` proves client-to-host SSH authentication only after the existing key is loaded in that client's agent; never claim this synthetic smoke test as live proof.
- Source `scripts/ssh-unlock.sh` only in the connecting client's interactive terminal. Passphrases stay there. Disk encryption remains unchanged. Permanent removal requires the old passphrase and an explicit separate Owner choice at action time.
- Never expose private keys, passphrases, tokens or injected secret values. Credential references only.
- A fresh chat must load this skill and reconnect applicable tools. This package is not a remote HTTPS MCP endpoint and does not automatically restore sessions.
