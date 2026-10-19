import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const root = dirname(fileURLToPath(import.meta.url));
const helper = join(root, "../scripts/infisical-cloudflare-source-select.sh");
const run = (a, e="staging", p="/") => spawnSync("bash",[helper,JSON.stringify(a),e,p],{encoding:"utf8"});
const dev={env:"dev",path:"/"}, stage={env:"staging",path:"/"};
test("dev and staging pairs: exact staging wins",()=>{
 const r=run([dev,stage]); assert.equal(r.status,0,r.stderr); assert.deepEqual(JSON.parse(r.stdout),stage);
});
test("staging missing: never fallback to dev",()=>{
 const r=run([dev]); assert.notEqual(r.status,0); assert.match(r.stderr,/missing Cloudflare pair/); assert.match(r.stderr,/no dev fallback/);
});
test("multiple staging pairs fail closed",()=>{
 const r=run([dev,stage,stage]); assert.notEqual(r.status,0); assert.match(r.stderr,/duplicate Cloudflare pair/);
});
test("staging wrong path does not use another location",()=>{
 const r=run([dev,{env:"staging",path:"/nested"}]);assert.notEqual(r.status,0);
});
test("malformed metadata never becomes a source",()=>{
 const r=run([{env:"staging",path:12}]); assert.notEqual(r.status,0);
});
test("staging workflow pins verified Infisical identity and environment",()=>{
 const w=readFileSync(join(root,"../.github/workflows/provider-incentive-staging-deploy.yml"),"utf8");
 const s=readFileSync(join(root,"../scripts/infisical-discover-project.sh"),"utf8");
 assert.match(w,/INFISICAL_CLOUDFLARE_SOURCE_ENV: staging/);
 assert.match(w,/INFISICAL_CLOUDFLARE_PROJECT_ID: e8cfba67-ea99-4d79-bc9f-87b862f9129c/);
 assert.match(w,/project-slug: .*steps.infisical_project.outputs.project_slug/);
 assert.match(s,/RAW_COUNT/);assert.match(s,/select_cloudflare_source/);
});
