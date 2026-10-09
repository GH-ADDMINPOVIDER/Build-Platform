import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const s=fs.readFileSync(new URL("../.github/workflows/oge-107-session-recall-proof.yml",import.meta.url),"utf8");
test("OGE-107 read-only authenticated recovery workflow",()=>{
 assert.match(s,/workflow_dispatch/);
 assert.match(s,/Infisical\/secrets-action/);
 assert.match(s,/persist-credentials: false/);
 assert.match(s,/\/api\/session/);
 assert.match(s,/\/api\/1lss\/history-page/);
 assert.match(s,/\/api\/1lss\/context-recall/);
 assert.match(s,/RECALL_NOT_SAME_SESSION_LINE/);
 assert.match(s,/remote D1 writes: 0/);
 assert.match(s,/cross-model resume: NOT TESTED/);
 assert.doesNotMatch(s,/wrangler\s+deploy|git\s+push|cloudflare\s+d1\s+execute/i);
});
