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
- For Owner-authorized, one-time passphrase removal, use `bash scripts/ssh-remove-passphrase.sh --remove-passphrase /absolute/path/to/existing-private-key` **only in the terminal holding the original key**. It prompts for the old passphrase locally. An already-unencrypted original key may be selected for explicit `probe:true` via the MCP client setting `UNIFIEND_SSH_KEY_FILE` (a local absolute path, never secret bytes), with no expiring SSH-agent dependence. This is not proof of an SSH connection until the live probe succeeds.
- Otherwise source `scripts/ssh-unlock.sh` only in the connecting client's interactive terminal. Passphrases stay there; disk encryption remains unchanged.
- Never expose private keys, passphrases, tokens or injected secret values. Credential references only.
- A fresh chat must load this skill and reconnect applicable tools. This package is not a remote HTTPS MCP endpoint and does not automatically restore sessions.
