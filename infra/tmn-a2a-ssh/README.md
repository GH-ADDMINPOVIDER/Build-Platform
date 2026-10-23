# WAVE / TMN — A2A Docker Runtime behind SSH (staging only)

**Existing architecture:** A2A -> WAVE TaskEnvelope -> Owner + ATHENA/Yellowstone -> GH_ADDMIN_POVIDER / TMN -> SSH -> Docker -> signed ResultEnvelope -> Ruby / D1 -> CERT.

This folder is the **private Docker runtime interface**, NOT a new GitHub identity, general-purpose executor, database, proxy, or replacement for WAVE Worker / signed Owner approval.

## Network and execution boundary

- Existing OCIAN-S HOST: Docker Engine is already installed; see historical GH1 run 39701916640 (HOST_DOCKER_ACCESS=YES, 2026-10-22).
- Docker Compose publishes **127.0.0.1:18761 only** on the HOST. It is not remotely accessible directly.
- The operator's existing authenticated SSH access can forward to that port:
  ssh -N -L 18761:127.0.0.1:18761 wave@<EXISTING_APPROVED_HOST>
  (Use the already trusted SSH host fingerprint and existing credentials. Do not paste keys into chat.)
- JSON-RPC A2A clients connect at http://127.0.0.1:18761/a2a through the SSH tunnel.
- A2A Agent Card at /.well-known/agent-card.json requires scoped bearer.
- WAVE_TMN_A2A_TOKEN is a staging secret supplied by the existing approved Infisical/GH2 action injection. No values, new secrets, or tokens are stored in Git.
- A2A JSON metadata MUST contain wave_task_envelope with existing wave.task.envelope.v1 contract; no parallel state authority.
- This v0.1 adapter actually runs a bounded **tmn.runtime.probe** inside its Docker process and offers tasks/get for the same process-lifetime probe receipt. All non-read-only or arbitrary-command tasks reject closed. A JSON string claiming signed_gate="ATHENA_YELLOW" is NOT proof of cryptographic owner authorization.
- It does NOT call Codex, does NOT execute general A2A requests, does NOT write D1 or LINCENC, and does NOT claim live A2A E2E.
- Container: unprivileged UID, read-only filesystem, drop all Linux capabilities, memory <=192MiB, CPU <=0.5, no Docker socket, no SSH keys, no production env or host secrets mounted.
- Use the existing external ATHENA/Yellow -> TMN route for future authorized work; do not silently grant A2A itself EXECUTE authority.

## Existing GH2 runner dependency

GH2 self-host Run 39838575588 was still queued at last independent readback. Thus **OCIAN host deployment is BLOCKED** until GH2 runner is bound to GH_ADDMIN_POVIDER or a separately authorized SSH route is verified. Do not use GH1 RP_STORE(OLD) as the command plane or claim CI Docker == Host Docker.

## Evidence gates

1. Hosted GH2 Actions Docker build + real HTTP A2A requests + negative authorization tests.
2. GH2 self-host runner receives bounded staging job (runner name, hostname and Docker socket access verified).
3. Host Compose launches with approved secret and no host public port (inspect 127.0.0.1 binding).
4. SSH port forward plus genuine A2A probe message/send and tasks/get returns a verified Docker-process artifact.
5. Separate Owner-authorized A2A -> TMN -> Codex/OPC -> signed result -> D1/CERT readback for **FULL E2E**. No GREEN/ORANGE upgrade before this.

Rollback on the exact GH2-host staging path: docker compose -f infra/tmn-a2a-ssh/compose.yml down (stops this isolated service only; does not touch other containers).
