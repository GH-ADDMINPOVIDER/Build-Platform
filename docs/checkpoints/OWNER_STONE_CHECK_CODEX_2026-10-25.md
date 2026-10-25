# OWNER STONE CHECK — READ FIRST — CODEX / WAVE CHECK-IN + CHECK-OUT
**Evidence capture:** 2026-10-25 Asia/Bangkok · **Scope:** GH-ADDMINT POVIDER active technical repo `Wave-Runner-2/Build-Platform` · **Classification:** append-only evidence, not a new E2E certificate.

## MANDATORY ENTRY GATE: STONE CHECK (applies to GS Normal, Work, GT, Codex and all modes)
1. Before **any CHECK-IN, CHECK-OUT, permission question, status claim, handoff, deployment or self-host repair**, consult the Owner's `CERT. LINCENC MAIN OWNNER` and the Owner Report: https://drive.google.com/drive/folders/1fNQVX0AkpEV6hqweiYcNk-DFtzYeWwin.
2. **Open each and every image** in Owner Report, not merely the folder title or thumbnail. **Read all visible textual content in every screenshot** (including timestamps, technical IDs, warnings, labels, UI details, run/job/SHA, signatures, actor, error lines and context). Follow the full [image manifest](./OWNER_REPORT_IMAGE_MANIFEST_2026-10-25.md) and include images added since this manifest; record which images were actually read and which were unreadable. No assertion that all 73 were read unless that read happened. File upload time is not screenshot event time.
3. Match the transcript of each image to **CERT/Checkpoint + task ID + exact SHA + CI run/job + D1/ATHENA result or limitation**. Cross-check GH2 operational, GH1 store historical, Cloudflare D1/ATHENA receipt, and ChatGPT Project context. GitHub Issues/Linear are trackers, not executor certificates; the Sheet is Owner viewing/audit copy, not a fifth runtime engine.
4. **Never restart authorization interrogation** when the matching owner authorization, account scope, source SHA or successful receipt has already been evidenced. New authentication may only be required for a **specific unproved new scope**, an actual revocation/error, or an expiring grant; state exact contrary evidence and affected hop. Owner MUST NOT be asked to repeat already-certified answers merely because another chat/mode starts.
5. **Preserve all historical GREEN/PASS and ORANGE/E2E immutably**, especially CP-005, 006, 007, 042, 046. Old `PARTIAL_AMBER` is NOT orange E2E. Current failure/queue is a NEW separate event. Never delete/rename/downgrade prior certificate, role, task id, source SHA, run/job or readback hash. Changes are append-only and staging-scoped.
6. **Do not give Codex hand-held bug guesses or seven-day retellings**. The implementation executor must independently trace the real flow, discover defects, repair them within scope, test, record evidence, and return the remaining blockers. Do not call source-only CI an E2E success. Do not create extra Runner, Host, Codex or Docker daemon, do not dispatch via `store`.
7. Canonical owner intent is ONE command family `ogenic-ctl check-in` / `ogenic-ctl check-out` for ALL modes, with authenticated Owner/Agent identities and signed WAVE command -> GH2 -> existing OCIAN-S HOST -> CODEX-TMN Docker -> D1 -> independent RESULT readback. Check-in/out command spelling does **not** confer unrestricted sudo or cross-provider tokens. Separate bounded authorizations still apply.
8. At every check-out produce a delta ledger **PROVEN DONE / SOURCE OR LOCAL ONLY / BLOCKED / UNVERIFIED**, with exact original and new evidence, source time, no repeated entitlement questions and an append-only report at all reachable Checkpoints. If a checkpoint cannot be written because the connector lacks that execution/readback capability, say so without declaring it PASS or asking Owner to re-prove old scope.

## Source evidence for latest Codex CLI session (user-supplied IMG_3281.jpeg, 25 Oct)
**Do not represent the following as remote E2E:**
- Local Codex transcript: `npm test` reported **618/618 passing**; `npm run build` reported pass; `npm run typecheck` executed but terminal exit/result log was not displayed clearly; `git diff --check` was invoked.
- Command attempted: `/home/wave/.local/bin/ogenic-ctl check-in --mode GS --runtime codex…` — no proof of **authenticated CHECK-IN** or WAVE/MCP ingestion/independent runtime readback. **CHECK-OUT** independently unproven.
- Git remote displayed `https://github.com/Wave-Runner-2/Build-Platform.git`, baseline `3705c3c8439d2e1576fe337f33a8887cdc74c66d`. This displayed SHA is a baseline line, not proof of committed latest CLI changes.
- `git status` output showed **untracked** `worker/ogenic-ctl.ts`, `tests/ogenic-ctl.test.mjs`, `tests/ogenic-ctl-cli.test.mjs`. No commit SHA, pushed branch, PR or CI run/job tying these 3 files to completed source integration was visible.
- Codex said status remains `BLOCKED_RED` (lack of authenticated check-in, new CI run/job, WAVE/MCP entry proof). It then hit **Usage Limit**. This is quota exhaustion, not evidence of host permission revocation or proof of model lock.
- **Owner Report evidence**: https://drive.google.com/drive/folders/1fNQVX0AkpEV6hqweiYcNk-DFtzYeWwin; 73 files indexed as of reading, each must be individually read before full Stone Check compliance. Screenshots of earlier flows/Green Stone and permissions are prior scoped evidence, not automatic current GH2 check-out E2E.

## Current GH2 independently verified in this session
- GH2 Private Build-Platform account has repository `admin=true`, `push=true` via connector; **this is not host CLI authorization**.
- Open Draft PR [#15](https://github.com/Wave-Runner-2/Build-Platform/pull/15) is scoped runner route repair; selfhost Run [40104242753](https://github.com/Wave-Runner-2/Build-Platform/actions/runs/40104242753), Job `120902507163` remains `queued` at live read, without `runner_name` or completed Codex result.
- Earlier Run [39838575588](https://github.com/Wave-Runner-2/Build-Platform/actions/runs/39838575588), Job `120033260231` is now `completed/cancelled` (CERT older snapshot said QUEUED): this is a new observed status, **not** original green regression.
- Historical `store` Run 39702219051 and CP-005/006/007 scoped PASS preserved; GH2 CP-042 PR#6 source write and CP-046 D1 mailbox E2E preserved separately.

## CHECKPOINT DELTA — OWNER REPORT / CODEX CURRENT
| Checkpoint or gate | What has actually changed / proven | Still unclosed |
| --- | --- | --- |
| CP-013/014/015/017 · WAIT-02/03/04/06 | Host transcript has Codex session / CLI invocation; prior SSH/auth evidence retained. | Full **mode-independent, authenticated** command/sudo/IDE/LCI CHECK-IN/CHECK-OUT path and receipts not proved. Do not equate this new gap to revoked historic permission. |
| CP-021/022/036/037/041 · WAIT-11/X05/X12 | Canonical `ogenic-ctl` implementation attempted with all-mode intent; local 618 tests and build claimed. | WAVE website and MCP real ingress, mode-by-mode dispatch, persisted UI result, final typecheck readback, and authenticated run not proved. |
| CP-026/029/031/038/040 | Owner Report folder and manifest linked; immutable provenance and new Stone Check gate documented. | Native ChatGPT Project file persistence and per-image transcription not yet proved. |
| CP-032 · WAIT-15/X10 | Existing Sheet public-writer security finding preserved. | No sharing or ACL modification attempted. |
| CP-055/056/057 · WAIT-X18/X19 | Latest GH2 PR#15 and queued job located; local CLI code described above is not pushed/CI-proven. | GH2 selfhost runner allocation -> Docker CODEX-TMN -> real task/result -> D1/CERT readback. |
| CP-058/059/060/061 · WAIT-X20 | Design/reference/source retained, no overwrite of prior proof. | n8n context relay, signed task envelope and callback to TMN E2E not evidenced. |
| CP-045/049/053/054 · WAIT-X14/15/16/17 | Previous GS/GT inbox and source work remains scoped as in CERT. | Independent GT authentication/ACK/DONE and actual cross-account task closure. |
| CP-008/044 · WAIT-12/X08/X13 | Historical independent CI failures preserved. | Repaired isolated current SHAs and passing job/readback for their exact scopes. |

## Other GH2 Codex / Work branch backlog (not merged = not completed runtime)
- [PR #7](https://github.com/Wave-Runner-2/Build-Platform/pull/7) GS↔GT fabric: draft; no authenticated GT E2E.
- [PR #8](https://github.com/Wave-Runner-2/Build-Platform/pull/8) task envelope: draft; no independent result receipt.
- [PR #10](https://github.com/Wave-Runner-2/Build-Platform/pull/10) Owner WAVE command routing: draft; no new GH2 selfhost E2E.
- [PR #11](https://github.com/Wave-Runner-2/Build-Platform/pull/11) TMN Docker security repair: draft; no new validated host E2E.
- [PR #12](https://github.com/Wave-Runner-2/Build-Platform/pull/12) TMN Docker A2A: draft; no new validated A2A E2E.
- [PR #13](https://github.com/Wave-Runner-2/Build-Platform/pull/13) CCS 15 protocol modes / Docker: draft; 15/15 live external E2E unverified.
- [PR #14](https://github.com/Wave-Runner-2/Build-Platform/pull/14) Hermes Agent source intake: draft; source only.
- [PR #15](https://github.com/Wave-Runner-2/Build-Platform/pull/15) GH2 selfhost Codex: draft, latest runner job queued.
All these require **executor self-discovery and proof**, not more repetitive owner interviews. No new merger/deploy executed by this evidence import.

## Four checkpoint destinations / honesty about propagation
1. **GH2 GH-ADDMINT POVIDER** — this document & manifest are versioned evidence on a separate staging documentation branch. GH2 is primary.
2. **GH1 `store`** — link historical immutable evidence only; **NO write** to archive.
3. **Cloudflare D1 / ATHENA** — existing historic receipts remain; **NO authenticated D1 write/readback executed by this documentation update**. Do not claim cross-store parity.
4. **ChatGPT Project `Wave-check point session`** — this chat and linked owner-source provide handoff context, but **project-native file write/readback is not evidenced**. Owner-view CERT can provide linked evidence; it is NOT Project-native storage.
Owner View: `CERT. LINCENC MAIN OWNNER` sheet https://docs.google.com/spreadsheets/d/12Udw2-bMrvZ7oHC2SaJ3IXyIWH9HdXrGDtLCLIyYTyg/edit (append-only Stone Check tabs only).

**Next executor mandate:** Work from the actual latest evidence and end-to-end architecture; detect root causes and complete all in-scope unfinished work independently, without coaching/guess lists from GS and without re-asking already-proven identities/permissions. Preserve 5 Green anchors and provide exact source SHA/CI/job/receipt for each new accepted gate.
