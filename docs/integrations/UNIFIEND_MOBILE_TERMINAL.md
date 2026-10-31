# Unifiend mobile terminal

Owner continuation, 31 October 2026. Source scope is Unified-on-Progress only. No production deployment, host resize, new host or paid subscription is performed by this change.

## Execution locations

| Mode | Where commands/builds execute | Effect on Ocian-S-Host |
| --- | --- | --- |
| Browser repository editor | Browser editing, with no terminal compute | No remote build provided |
| VS Code Remote Tunnel | The machine running the VS Code server | Host still pays for server, extensions and builds |
| Copilot CLI remote control | The machine running that CLI session | Host must remain online and carry its tools |
| Codespaces | Provider VM/container | Heavy build work can move off the host; separate quota/billing |
| Copilot cloud agent | Provider environment | Separate entitlement and usage; existing subscription not verified |
| OpenCode TUI/serve | Shell, files and tools on its installation machine; model requests to the selected provider | Remote inference does not move shell/build memory off the host |

SSH is a connection protocol. CLI is an interface. Operations privileges are permissions. These are not five separate programs that each require a machine. A 1 GiB host may support a small sequential broker/CLI workload; no capacity guarantee or downgrade is made without peak memory measurements. Installing an open-source coding client does not install model weights or grant a paid model entitlement.

## Existing sources actually inspected

- Primary fork `Wave-Runner-2/vscode-remote-try-node` is a fork of `microsoft/vscode-remote-try-node`, with `.devcontainer/devcontainer.json` present. It is a development-container example, not proof of an active remote environment.
- Archived fork `Ogenicchocolate21debug/pro.webssh.net` is a fork of `isontheline/pro.webssh.net`, an Apple-platform SSH client project. Read-only inspection only; no archive execution or changes.
- Installed-repository lists are not starred-repository lists. `unifiend-saved-tools.mjs` independently reads starred metadata using the existing verified primary credential, fixed account names, GET only, at most three pages per account. Partial/denied reads are explicit.
- Existing roster says Copilot CLI installed with auth unverified. This historical note is not current host authentication proof.

## OpenCode with existing Infisical

Pinned package: `opencode-ai@1.19.5`, checked against the official release metadata. The host installer preserves an existing installation and uses the existing unprivileged service account. Cloud package verification is separate from host installation.

`scripts/unifiend-opencode.py` defaults to status. TUI/serve require an explicitly selected `deepseek/MODEL_ID` and the existing `DEEPSEEK_API_KEY` environment reference. Invoke through the existing service-account Infisical machine identity once that identity is verified. Root Infisical working does not prove service-account Infisical working. No new key reference is invented and no login reset is performed.

```bash
python3 scripts/unifiend-opencode.py status
# With the existing authorized Infisical injection in the service-user shell:
python3 scripts/unifiend-opencode.py tui --model deepseek/MODEL_ID
# Requires the existing OPENCODE_SERVER_PASSWORD reference as well:
python3 scripts/unifiend-opencode.py serve --model deepseek/MODEL_ID
```

`MODEL_ID` is a placeholder to replace with an actually available model, never a claim of entitlement. Only the chosen provider key reaches the OpenCode process. Provider administration, Owner, unrelated model keys and Codex profile selectors are excluded. Server mode listens on loopback only, with a password required; a private authenticated transport is needed before phone access. No public terminal listener or tunnel is created here. The wrapper shares the existing Terminal Solo lock. It is an opt-in terminal tool, not yet an autonomous D1 command adapter.

OpenCode can authenticate GitHub Copilot through its own supported `/connect` device flow. The provider PAT and Codex session are not Copilot credentials. No paid subscription or successful Copilot OAuth is inferred from installation.

## Code colors

`.vscode/settings.json` and `.opencode/themes/unifiend-light.json` use a screenshot-inspired light palette: white/near-white background, black text, red strings, purple keywords, olive properties/types, blue numbers and green success. OpenCode uses `config/unifiend-opencode-tui.json` through the wrapper. This changes repository workspace settings, not ChatGPT's native application colors or the DigitalOcean Console renderer. Rendering on the host awaits installation/use.

## Existing host binding cutover

The last successful Owner Console read showed the existing active service bound to the archived repository, registration 21, while primary repository 1429580446 had zero registrations. Both existing Codex profiles reported ChatGPT login; package, account equivalence and inference were not thereby proven. The command consumer remains pinned to GS. GT/Go is parked.

`unifiend-host-cutover.py` is plan-only unless `--apply` is explicitly supplied. It checks the Console-verified public host pin, principal 342175560, repository 1429580446, existing installation, service user and actual service executable, absence of active work and an empty primary registration inventory. Registration permission and token expiry are checked before stopping the old service. Native state is moved into a root-only recovery directory in the same installation. No archived-provider write or automatic fallback is allowed.

The same installation registers as Ocian-S-Host using only custom label `unifiend-capability`, and a separate `_work-unifiend` directory. The existing command workflow and Terminal Solo caller now select that name/label and numeric repository identities. Historical generic labels are intentionally absent, so unrelated old queued jobs do not start automatically. Existing Codex profiles and archived work directories are preserved. A failed cutover leaves exact sanitized phase/exit information and preserves recovery files. Do not repeatedly rerun a partial failure without reading its phase.

The host plan inspector uses installed Codex app-server account/read and account/rateLimits/read, refreshToken=false, with no inference. It emits allowlisted package/allowance metadata and whether account metadata matches the existing GS identity hash, never email, auth files or tokens. Root and service profiles are inspected independently.

## Validation and boundaries

Local/Cloud unit tests exercise native file moves, service sequencing, denied permission before stop, busy work preservation, configuration failure without archive restart, idempotent preflight, protocol buffering, child environment filtering and loopback binding. These tests are not remote host execution. The pinned Console launcher must execute on the existing root Console before PRIMARY_ONLINE or installed-host status can be claimed. SSH remains blocked at the existing encrypted client-key unlock; a valid server public pin is already available.

p-stack: 24 Fix root causes; 28 Make operations idempotent; 29 Migrate callers then delete legacy APIs; 34 Prove it works; 50 Unslop.

## Console command

Open `scripts/unifiend-console-cutover-launch.sh`, paste its complete contents into the existing root Console, and append the apply flags when invoking it as a saved file:

```bash
bash scripts/unifiend-console-cutover-launch.sh --apply --install-opencode
```

Pasting the script itself without flags performs only the plan. A root Console outside a checked-out repository should use the complete self-contained launcher, with `--apply --install-opencode` added after `python3 -` before the heredoc. It needs the working existing Infisical CLI session; it does not request a new Codex login.
