# Unified WAVE line 1 check-out
Date: 2026-10-30, Asia/Bangkok.
Task: WAVE-LINE1-20261030. Classification: partial technical audit and source correction, not full runtime completion.

## Current Owner direction
Use GH-ADDMINPOVIDER in full. Treat GH-ADDMINPOVIDER + Infisical + Linear as the operating core. Trace GH-ADDMINPOVIDER -> Infisical -> Terminal -> Codex. Linear is an audit/support port with all actually supported capabilities; Manus is the coverage port. Consolidate into Unified WAVE after checking each existing line. Preserve accepted green/orange history and store as read-only.

## Check-in
Read canonical staging HEAD, AGENTS.md, provider and authority bindings, previous session checkpoints, CERT Sheet, Linear OWNER-28, Vercel deployment metadata and actual build error events. The Owner image folder was indexed previously; all 73 images have NOT been individually read in this session. No full Stone Check completion is asserted.

## Verified findings
1. Canonical source: Wave-Runner-2/Build-Platform, phase-vi-provider-incentive-metering, 90966cc9c9802264930d3bff55e79be7081d5442.
2. Provider config records GH-ADDMINPOVIDER; actual GitHub numeric principal 342175560; Infisical configured reference GH_ADDMINPROVIDER; one existing OCIAN-S-Host.
3. Existing source contains Infisical OIDC integration and host execution contracts. A versioned key reference is not proof that this chat has independently opened SSH. No credential values were read or copied.
4. Vercel deployment dpl_87AkrwZsW6K3ZS6gYLGpqer6mrME is READY but Git metadata identifies the store repository, branch phase-vi-provider-incentive-metering, SHA b0833c40d1c1c496830962ea43d1f6be9a1e52b9. It is not canonical current source.
5. Actual error events from Vercel deployment dpl_GZ4mufwTP19RjQonbd9Vz3aSeoNy show Vite client/Worker builds completed and then BUILD_FAILED: No entrypoint found. This establishes a build-target/entrypoint error for that deployment, not a cause of host execution failure.
6. Two projects returned by Vercel inventory returned HTTP404 when read in the same recorded team. Retain this as an unresolved inventory/read discrepancy; do not assume deletion or reconnect them blindly.
7. The existing closeout workflow still read GitHub issue 28, which is absent from the current repository, and its prompt required a distinct additional execution instance. Both conflict with the current canonical single-machine contract. The tracked recovery task is Linear OWNER-28; GitHub issue 9 exists for the bounded execution line.
8. Linear OWNER-28 is In Progress, updated 2026-10-30T09:56:33.835Z, and explicitly carries the current identity correction and existing signed WAVE task.
9. Prior WAVE live inspection showed canonical certificate D1_DOCUMENT_SHA256_MATCH and current host tasks without an execution receipt. These bounded historical reads are preserved; no new D1 check-out write is claimed.

## Source correction
On an isolated branch, update only the closeout task prompt and the missing issue reference, add the current AGENTS directive, and add the Unified WAVE skill/contract. Do not change production deployment, secrets, host services, database schema, scheduling transport, or historical certificate records. Source checks do not prove host execution.

## Acceptance and remaining work
Verify the corrected prompt references the existing single machine and current issue, parse embedded JavaScript and Bash, and read the committed files back.
Next runtime diagnostic: resolve the existing SSH credential binding and trusted host identity through the configured authorized environment, then verify actual Terminal/Codex result. Do not create credentials, select store identity or dispatch a duplicate task.
Vercel connection retirement/repointing is not performed. First confirm caller/domain parity and preserve any working surface.
D1/ATHENA execution check-out and external host installation remain unperformed; record them explicitly until there is actual authenticated readback.

## Checkpoint destinations
- Canonical GitHub: this versioned source correction and report, verified by connector readback after save.
- Personal governing skill: current Owner contract and this bounded audit retained; installation verified separately.
- Linear: append-only audit entry on OWNER-28; leave current status unchanged.
- CERT Sheet: separate new check-out view, preserving previous rows and colors.
- D1/ATHENA: NO NEW WRITE OR EXECUTION RECEIPT.
- store: READ ONLY; NO WRITE.
- Project-native runtime: NO INDEPENDENT WRITE CLAIM.

p-stack applied: 24 Fix root causes; 30 Minimize reader load; 34 Prove it works; 50 Unslop.
