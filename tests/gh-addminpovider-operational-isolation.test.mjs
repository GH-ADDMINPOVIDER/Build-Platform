import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const paths=["worker/unifiend-command-dispatch.ts","worker/entry-yellow-stone.ts","worker/verified-function-tools.ts","worker/openai-selfhost-api.ts","worker/codex-left-arm-api.ts","worker/capability-execution-api.ts","config/oge95-rules-center.json","config/github-oidc.staging.json","config/n8n-oge-placement.json",".github/workflows/oge-28-provider-host-capability.yml","scripts/oge34-github-worker-binding.mjs","scripts/replica-executor/athena-context.mjs",".github/workflows/candy-100-worker-restore.yml",".github/workflows/candy-production-deploy.yml",".github/workflows/oge-25-codex-account-smoke.yml",".github/workflows/oge-25-codex-local-auth-smoke.yml",".github/workflows/oge-28-bubblewrap-host-verify.yml",".github/workflows/oge-28-host-ssh-codex-auth-audit.yml",".github/workflows/oge-28-install-infisical-cli-host.yml",".github/workflows/oge-28-provider-recovery-proof.yml",".github/workflows/oge-40-github-token-isolation.yml",".github/workflows/oge-98-codex-hosted-fallback.yml",".github/workflows/oge-98-codex-scoped-code-proof.yml",".github/workflows/oge-host-capacity-inventory.yml",".github/workflows/oge-infisical-plugin-metadata-audit.yml",".github/workflows/oge-unifiend-compose-client.yml",".github/workflows/oge-unifiend-standby-toolkit.yml",".github/workflows/oge-unifiend-tools-activation-proof.yml",".github/workflows/oge95-commit-drain.yml",".github/workflows/phase-vi-linear-d1-roundtrip.yml",".github/workflows/provider-readiness-audit.yml",".github/workflows/unifiend-owner-terminal-auth-proof.yml",".github/workflows/unifiend-terminal-solo-proof.yml","config/workflow-engine.staging.json"];
test("active operational bindings never reference retired GitHub identities",()=>{
 for(const path of paths)assert.doesNotMatch(readFileSync(path,"utf8"),/Ogenicchocolate21debug|Wave-Runner-2|1350684572|306097555/i,path);
});
test("canonical GitHub identity and OIDC configuration agree",()=>{
 const p=JSON.parse(readFileSync("config/github-provider.json","utf8"));
 const o=JSON.parse(readFileSync("config/github-oidc.staging.json","utf8"));
 assert.equal(p.repository,"GH-ADDMINPOVIDER/Build-Platform");
 assert.equal(p.repository_id,1429580446);
 assert.equal(p.github_user_id,342175560);
 assert.ok(o.subject.includes("GH-ADDMINPOVIDER@342175560/Build-Platform@1429580446"));
});
