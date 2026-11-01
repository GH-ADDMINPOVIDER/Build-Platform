# Unifiend Capability | GH-ADDMINPOVIDER

## Contents and boundaries

This dedicated package contains a skill, a non-secret contract, a Python stdio MCP server and a Bash helper. Requires Python 3.9+; no Python packages, model calls or new host are needed. Registration does not prove authentication, available quota or successful execution.

| File | Purpose |
|---|---|
| `SKILL.md` | Recover context and choose authorized adapters |
| `references/provider-contract.json` | Stable references and historical evidence |
| `scripts/tools_server.py` | Four local inspection/planning tools |
| `scripts/ssh-unlock.sh` | Temporarily load an existing key in this terminal's SSH agent |

## Configure local tools

Run on the machine that will host the tools, from this package directory:

```bash
python3 scripts/tools_server.py --print-config
```

It prints actual absolute paths for a local stdio MCP client. For mode planning add the existing authorized worktree to the server environment:

```json
{
  "mcpServers": {
    "unifiend-capability": {
      "command": "/absolute/path/to/python3",
      "args": ["/absolute/path/to/unifiend-provider-capability/scripts/tools_server.py"],
      "env": {"UNIFIEND_WORKTREE": "/absolute/path/to/existing/worktree"}
    }
  }
}
```

Replace every placeholder with real paths. Client formats vary. Never put credentials into this JSON. Inspection subprocesses receive basic runtime and SSH-agent environment only, not the vault environment. Actual work must use the existing authorized execution and Infisical route.

This server is local stdin/stdout, not a public HTTPS endpoint. It cannot be attached as a URL to a remote-only ChatGPT connector. Use an existing supported bridge or separately authorize deployment. A new chat must load the skill and reconnect tools; this package does not automatically restore logins.

## Tool interface

| Tool | Arguments | Output / limits |
|---|---|---|
| `unifiend_capability_contract` | `{}` | Historical contract; not live verification |
| `unifiend_copilot_status` | `{}` | Local executable/help flags; no auth, quota or inference |
| `unifiend_ssh_status` | `{}` or `{"probe":true}` | Default: agent state only. `probe:true`: a bounded live SSH login/marker through the **current client SSH agent** to the Owner-pinned host; does not unlock a key or expose identifiers |
| `unifiend_mode_plan` | `mode`, absolute `cwd`; mode-specific `prompt` or `port` | Structured argv; does not execute |

Modes: `terminal`, `prompt`, `acp-stdio`, `acp-tcp`. Worktrees must exist under `UNIFIEND_WORKTREE`, including after symlink resolution. Ports 1024–65535; default 3000. Prompts 1–12000 characters. Use argv-aware execution adapters; do not concatenate returned text into a shell command.

Example call after MCP initialize and initialized notification:

```json
{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"unifiend_mode_plan","arguments":{"mode":"acp-stdio","cwd":"/absolute/path/to/existing/worktree"}}}
```

Copilot plans require a compatible installed CLI, authorized GitHub or BYOK provider, quota and native permission checks. `--enable-all-github-mcp-tools` exposes tools; it grants no GitHub permissions. ACP connects client and agent; it is not a skill or subscription. Reuse existing tested `scripts/unifiend-copilot-modes.py` and `ops/unifiend-console-copilot.sh` for real execution.

## Optional live SSH authentication proof (no key changes)

The caller can use either an existing unlocked SSH agent or an explicitly configured **already unencrypted original private key**. To avoid agent expiry, set `UNIFIEND_SSH_KEY_FILE` to the absolute local key path in this MCP server's `env`, never to the key bytes. The file must be owned by the same local user, regular (not symlink) and mode 0600. No private key is copied into a repo, GitHub Actions CI, ChatGPT or Infisical by this tool.

Then the local MCP client may invoke:

```json
{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"unifiend_ssh_status","arguments":{"probe":true}}}
```

This is an **explicit, optional live network operation**, not part of normal tool inspection. It authenticates over SSH to the existing Owner-verified host using **public pinned trust only**, performs a fixed `printf` marker, then disconnects. No arbitrary command, key copy, passphrase prompt, host reconfiguration, deployment or new runner. It returns `PASS_GREEN_AUTH_ONLY` solely for a real successful remote marker. It cannot certify host tools, Copilot quota, Infisical or D1/E2E. Otherwise it reports a precise `NOT_VERIFIED` blocker without outputting SSH stderr. A CLI fixture test proves logic only and **MUST NOT** be promoted as actual host authentication.

The public host key/fingerprint are duplicated from the verified Owner Console record in `references/provider-contract.json` for portable local inspection. Reverify the pin through the Owner Console before changing it. Do not set `StrictHostKeyChecking=no`.

## SSH temporary unlock

Server host key = server identity. Client private key = client authentication. GitHub/Copilot login is separate. An agent on one machine does not unlock a key on another.

On the connecting client's interactive Bash terminal:

```bash
source scripts/ssh-unlock.sh /absolute/path/to/existing-key 1h
ssh-add -l
```

Enter the old passphrase only in the terminal prompt. Sourcing retains `SSH_AUTH_SOCK` in this shell when starting an agent. The key stays loaded for one hour, while its encrypted file remains unchanged. Key expiry does not stop the agent process. Use `ssh-agent -k` only for an agent you started and no longer need; do not clear other users' identities. The helper does not connect to the host. Afterward use the normal authorized SSH command and existing verified host pin; never disable host verification.

## Permanent passphrase removal — Owner-authorized one-time action

On **the SSH client that already holds the original encrypted private key**, run this one time in an interactive terminal:

```bash
bash scripts/ssh-remove-passphrase.sh --remove-passphrase /absolute/path/to/existing-private-key
```

It asks for the **old** passphrase locally via `ssh-keygen`, changes only that existing file, enforces 0600, and verifies empty-passphrase readability. It rejects non-interactive CI, wrong ownership and symlink keys. No replacement key is generated. After this one-time procedure, configure `UNIFIEND_SSH_KEY_FILE` in the local MCP client to let explicit `unifiend_ssh_status({"probe":true})` use the private key directly without an agent lifetime.

Removing a passphrase reduces protection of the private-key file. It does not preserve SSH TCP sessions, provider login sessions, or GitHub Runner registration. Use the existing runner as an auto-starting service for unattended job execution; SSH is for direct client access. NEVER install an unencrypted private key in this GitHub repository or a shared tool environment.

## Original manual ssh-keygen method

Possible only with the old passphrase. It removes disk protection and is not performed by this package. If the Owner explicitly chooses this later, run in the actual client's terminal:

```bash
ssh-keygen -p -f /absolute/path/to/existing-key
```

Enter the old passphrase locally, then an empty new passphrase only if permanent removal is intended. Never send passphrases/private keys through chat. Without the old passphrase this cannot decrypt the key. Do not overwrite or replace existing keys automatically. SSH unlocking does not require a new Codex login.

## Checkpoints and evidence

Before operational work reconcile source, Linear and D1. Append checkout to the existing certificate Sheet, preserving previous green/orange statuses. Record source commit, actual tests and unavailable checkpoints. This package adds no D1 writer and cannot claim ATHENA writeback. A historical hash is a reference, not a new write.

Previous ACP initialization passed against a synthetic provider with zero inference. That does not prove real model authentication, quota, host installation or SSH login. Verify those separately when the existing key is unlocked. Existing DeepSeek/provider routes are preserved.

## References

- https://modelcontextprotocol.io/specification/2025-06-18/basic/lifecycle
- https://man.openbsd.org/ssh-add
- https://man.openbsd.org/ssh-keygen
- https://agentclientprotocol.com/get-started/introduction

## Repeat the smoke test

Run `python3 scripts/smoke_test.py`. It starts the actual stdio MCP child process with local executable/agent fixtures, checks lifecycle, all four tools and all modes, rejects path/symlink escapes and invalid arguments, checks secret filtering, and checks SSH helper guards. It makes zero model calls, zero **real** SSH connections and zero key-file changes; a mocked ssh fixture verifies the optional probe contract. This proves package behavior, not real provider authentication.
