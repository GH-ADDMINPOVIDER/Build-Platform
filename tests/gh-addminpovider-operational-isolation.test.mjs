import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const paths=["worker/unifiend-command-dispatch.ts","worker/entry-yellow-stone.ts","worker/verified-function-tools.ts","worker/openai-selfhost-api.ts","worker/codex-left-arm-api.ts","worker/capability-execution-api.ts","config/oge95-rules-center.json","config/github-oidc.staging.json","config/n8n-oge-placement.json",".github/workflows/oge-28-provider-host-capability.yml","scripts/oge34-github-worker-binding.mjs","scripts/replica-executor/athena-context.mjs"];
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
