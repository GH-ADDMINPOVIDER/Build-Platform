# OGENIC plugin + self-host capability registry — 2026-10-14

Status: **Audited and staged**, not a production migration. This is an inventory / deferred-capacity plan, not authorization to create paid infrastructure, move Secrets, deploy websites, or start external-facing services.

## Evidence

- Read-only Unifiend host inventory: https://github.com/Ogenicchocolate21debug/Build-Platform/actions/runs/38493903293
- Infisical CLI user-local install: https://github.com/Ogenicchocolate21debug/Build-Platform/actions/runs/38491772460
- Bubblewrap sandbox verification: https://github.com/Ogenicchocolate21debug/Build-Platform/actions/runs/38492220381
- Active Codex account verification: https://github.com/Ogenicchocolate21debug/Build-Platform/actions/runs/38491235489
- Reusable workflow-local activation: https://github.com/Ogenicchocolate21debug/Build-Platform/actions/runs/38494480696 — composite action `.github/actions/ogenic-unifiend-tools/action.yml` and `rg/yq/uv/uvx/infisical` CLI smoke **SUCCESS**.
- Rootless Docker Compose CLI install: https://github.com/Ogenicchocolate21debug/Build-Platform/actions/runs/38494556161 — official SHA-256 verified, **Docker Compose v5.6.0 ready**. Client only; **zero containers created/started**.
- Standby small CLI installation **COMPLETE/SUCCESS**: https://github.com/Ogenicchocolate21debug/Build-Platform/actions/runs/38494192060 — SHA-256 verified: `rg 15.2.0`, `yq 4.54.1`, `uv/uvx 0.13.0`; no service started / secrets / sudo

## Current Unifiend host state (observed)

- Ubuntu 24.04.5 LTS, DigitalOcean Premium Intel, Linux x64; **1 CPU thread**, **984,552 KiB RAM**, ~**609,000 KiB MemAvailable**, **2,097,148 KiB swap**.
- Root filesystem **33 GB total, 17 GB used / 17 GB available** at observation.
- Docker daemon functional, **0 running containers**, **3 cached images**, ~250 MB image inventory.
- Git, GitHub CLI, Node 22, npm, Python 3.12, Docker, jq, curl, rsync, tmux, htop, Wrangler, Codex CLI 0.158, Bubblewrap 0.9 and user-local Infisical CLI 0.43.143 are present.
- Only `wave-runner-01` proved online on inspected host, no second runner instance proved, no noninteractive `sudo` for `unifiend`.
- **Installed on host ≠ ChatGPT connected app** and **installed CLI ≠ authorized Secrets access**.

## Confirmed installed ChatGPT app plugins via directory lookup (15)

| Group | Installed connector apps | Host strategy |
| --- | --- | --- |
| Code / CI / product releases | GitHub, Vercel, Railway, Lovable, OpenAI Developers, Context7, Statsig | Keep hosted APIs. `gh`, Node, `codex`, `wrangler` already available on Unifiend. Use least-privilege CI; do not install SaaS backend on Unifiend. |
| Delivery / communication / shared context | Notion, ClickUp, Linear, Gmail, Outlook Email | Hosted connectors; if automation needed, use existing GitHub/n8n API with proper scopes. Do not replicate Gmail/Outlook/Notion data into local host. |
| Design / commerce | Shopify, Figma, Canva | Hosted connectors; use API/webhooks with staging allowlist and managed auth. Do not start storefront, design server or unnecessary local DB. |

Additionally, **DataCamp, Manus, AppDeploy** tool groups are visible to ChatGPT in this session. Their app-directory installation status was not independently confirmed. Treat accessible tool surfaces as separate from the 15 confirmed installed apps.

**Not confirmed installed as ChatGPT plugins:** n8n, Cloudflare, Infisical, DigitalOcean, Google Drive, Google Calendar, Slack; some are used through other integration routes rather than ChatGPT plugins. Do not assume lack of standalone plugin means platform isn't configured elsewhere.

## Existing external/platform integrations

- n8n orchestrator and migration contracts exist in repo. `.github/workflows/oge-69-n8n-live-connect.yml` references the Railway-hosted staging endpoint `https://n8n-staging-76b7.up.railway.app` as a default, **not proof of current endpoint health**.
- Cloudflare Worker/D1 stage are configured through Wrangler and workflows; do not move databases to the Unifiend host.
- Infisical OIDC is used in existing Actions; CLI rootless install alone does not automatically authorize it or guarantee which secrets the runtime can access.
- Preserve canonical staging branch isolation, existing authorization policies, and separate Runner-2 account/work.

## Deferred on-host capability modules

| Priority | Module | Now or later | Gate / activation proof |
| --- | --- | --- | --- |
| P0 | `rg` (ripgrep), `yq`, `uv/uvx` | Install user-local to `/home/wave/.local/bin`, pinned/checksummed, no daemon. Installer: `scripts/host-bootstrap/ogenic-ready-toolkit.sh`. | GitHub Actions proof succeeds; read-only smoke CLI versions, no secrets |
| P0 | Capacity/health inventory and CI receipts | Already available | GitHub run link, real host CPU/RAM/Disk and runner ID |
| P1 | Restic/rclone **client binaries** | Optional future rootless binaries, not active | Separate approved storage destination, read/write scoping, encryption key via Infisical; test restore, not only backup. No storage provisioning by default |
| P1 | `cloudflared` **client binary** | Only if an authenticated tunnel is required | Approved domain, Zero Trust policies, ingress allowlist, no public expose by default |
| P2 | n8n local Docker **fallback** | **Do not start on current 1 GB host** | After capacity upgrade, separate DB/storage, encryption key, port restricted, real workflow migration and rollback proof |
| P2 | Uptime Kuma / health UI | Do not start now | After upgrade, bind loopback only with authenticated reverse proxy; safe alerts |
| P2 | Dedicated MCP gateway / OAuth relay | Do not start now | After upgrade, explicit identity scopes, auditing, no unrestricted shell or secrets forwarding |
| P2 | Runner-2 second **self-hosted agent instance** | Not provisioned/verified | Admin registration permission and host OS admin, unique runner ID, label, service, and **actual job on Runner-2**; more RAM recommended |
| P3 | Redis + Postgres + queue mode, Grafana/Loki/OTel | Wait until meaningfully larger capacity and measured needs | Sizing, backup/restore, access policies, metrics, change approval. Do not install on current host |

### Suggested future sizing — planning ranges, not measured requirements

- **Current ~1 vCPU / 1 GB RAM**: one existing Actions worker + CLI tools, no always-on n8n/DB/monitoring stack.
- **Minimum sensible expansion: 2 vCPU / 4 GB RAM**: one orchestration service or small MCP gateway plus CI, with queue/resource caps; monitor actual memory.
- **More comfortable: 4 vCPU / 8 GB RAM, 60–100 GB disk**: Runner and multiple light services with basic monitoring and backups; size based on peak builds, workload and retention.
- CPU/RAM upgrades or a larger disk cost money through hosting provider. `sudo`, CLI plugins and cached Docker images do not provide free physical capacity.

## Controls — must remain true

1. ChatGPT plugin installation does not deploy server-side software; each SaaS connector and its host runtime are distinct.
2. No new machine identities, secrets copies, production deployments, cloud resources or open network ports without separately approved scope.
3. Don't give self-hosted GitHub Actions unrestricted passwordless sudo or broad Infisical access. Existing Runner-01 secret authority is the only confirmed/intended secret lane.
4. Cached binaries / Compose definitions are not acceptance proofs. Activation needs actual job and authenticated end-to-end tests, plus rollback.
5. Capacity proof must be read from actual host before enabling any additional long-running containers. Default **all new services OFF**.

## Next operating steps

A. Complete/check `OGENIC Unifiend lightweight standby toolkit` action run and version markers.
B. Keep heavy modules in this catalog until owner has approved host upgrade; after resize, create a tested Compose profile/instance with internal-only access, health checks and storage mounts.
C. For Runner-2, continue Issue #28 only after host-admin and GitHub runner registration permissions are legitimately available.
