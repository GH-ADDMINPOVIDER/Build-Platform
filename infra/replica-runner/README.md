# WAVE Replica Runner — target 0.9:1

**Mission:** an ephemeral, isolated Ubuntu runner executing the same WAVE source/build and Cloudflare `workerd` runtime locally, then (only when expressly requested) handing off a *staging* deployment to the already approved GitHub Actions workflow. Not a second Green memory or Cloudflare backend.

## Architecture

```text
WAVE / ATHENA -> Yellow (capability request / approval)
    |    GitHub Actions workflow_dispatch (or manual)
    v
GitHub-hosted Ubuntu  +  Node 22  +  canonical repository commit
    |
    +-> npm run check (tests + TS + Vite/Worker build)
    +-> scripts/replica-runner/prepare.mjs
    |       strips live domain/routes and secrets, forces ALL D1 local
    +-> Wrangler local D1 + same repository SQL migrations
    +-> workerd/Miniflare: built Cloudflare Worker + assets
    +-> local API + Web/Chat + auth-deny checks
    +-> Ruby/GitHub artifact replica-evidence.json
    |
    +-> Optional operator-selected deploy_staging=true AND proof PASS
               |
               v
         Existing provider-incentive-staging-deploy.yml
               |
               v
         wave.ogenicchocolate.com  [staging only]
```

## Use

1. Run GitHub Actions **WAVE Replica Runner 0.9 - Local Parity Proof**, choose **Run workflow** and `deploy_staging=false` (default).
2. Check status and download `replica-evidence.json` from the run. A local-only SUCCESS means boot, local D1 migrations, API, authentication and UI paths passed. It does **not** certify 0.9 live parity.
3. To deploy after parity proof, deliberately select `deploy_staging=true` in another workflow_dispatch run. It reruns local proof and refuses if branch HEAD changed; it then dispatches **only** the *existing* staging deploy workflow, where normal credentials and checks apply.
4. Never deploy or pass Infisical/D1 secrets from the Replica VM. No provider-model smoke calls.

One-shot local commands (Ubuntu with Node 22 and repo checked out):

```sh
npm install --package-lock-only --ignore-scripts
npm ci
npm run check
node scripts/replica-runner/prepare.mjs
printf "y\\n" | npx wrangler d1 migrations apply wave-replica-local \
  --config dist/ogenic_phase_vi_staging/replica.wrangler.json --local
npx wrangler dev --config dist/ogenic_phase_vi_staging/replica.wrangler.json --local --ip 127.0.0.1 --port 8787
```

The GitHub workflow automatically runs probes and uploads the proof report. GitHub-hosted runner time uses existing plan minutes/quota, so this is not guaranteed free for all plans. No new DigitalOcean/Railway service is created.

## Live-vs-replica measurement (nonbillable)

The proof runs `scripts/replica-runner/compare.mjs` while the local Worker is alive and compares **10 fixed public/unauthenticated paths** on the local worker and `https://wave.ogenicchocolate.com`. It records expected HTTP status, API contract type and basic response shape (without saving response text), then calculates `staging_comparison.surface_match_ratio` in the evidence artifact. A 9/10 or 10/10 match reaches only **PUBLIC_SURFACE_TARGET** — it is not proof of complete 0.9 runtime parity because auth, external providers, actual D1 records and edge behavior are out of scope.

## 0.9:1 is a target — what counts?

The first proof measures **local operational coverage**, not mathematical production equivalence. A true >= 0.9 parity claim requires at least 9 of 10 pre-registered *identical-input* staging-versus-replica behavioral scenarios (path + status + structured result contract + authorization decision) to match, with exact tested commit, test suite, inputs and environments recorded. Stage an authenticated comparison only with existing owner authorization and read-only endpoints. Any untested component must be listed explicitly; do not silently remove failing tests.

Local reproduction is strong for app code, Worker APIs, bindings and local D1 migrations. It does *not* fully simulate edge routing, live Cloudflare zone/network, production D1 data/latency, Infisical secrets, third-party provider quota, n8n external state, Browser Run corner cases, or actual deploy availability. The 90% claim must remain **UNVERIFIED** until measured. Do not execute remote D1 migrations during the local proof.

## Next phases

- **A** (this iteration): isolated ephemeral CI VM, D1 snapshot-free local schema, API/Chat probes, immutable evidence, guarded staging handoff.
- **B**: fixed versioned OCI image / devcontainer with matching Node/Python/wrangler and hardened agent task executor; map n8n/Yellow job receipts without creating a second memory system.
- **C**: authenticated, read-only 10-case staging-vs-replica comparison, normalized dynamic fields and Ruby scorecard. Include a disposable staging-deploy smoke only when separately approved.

Do not put multiple runners on the existing 1-vCPU/1GB Droplet; this GitHub-hosted machine provides independent compute.
