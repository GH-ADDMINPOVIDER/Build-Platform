import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {analyze,analyzeChanges,svg,markdown} from "../scripts/oge95-review-visual.mjs";
const graph=JSON.parse(readFileSync("docs/architecture/oge-system-edges.json","utf8"));
test("only documented edges; scope and audit claims are explicit",()=>{
 const r=analyze(["worker/violet-stone-api.ts",".github/workflows/check.yml"],graph);
 assert.deepEqual(r.candidate_nodes,["GITHUB","VIOLET"]);
 assert.equal(r.runtime_verified,false);
 assert.ok(r.edges.every(([a,b])=>graph.edges.some(x=>x[0]===a&&x[1]===b)));
});
test("unmapped paths remain unmapped and untrusted paths fail closed",()=>{
 assert.deepEqual(analyze(["unknown/module.ts"],graph).unmapped,["unknown/module.ts"]);
 assert.throws(()=>analyze(["../secrets"],graph),/INVALID_PATH/);
});
test("deterministic svg and mermaid with no script",()=>{
 const r=analyze(["src/main.tsx"],graph);
 assert.equal(svg(r,graph),svg(r,graph));
 assert.match(markdown(r),/mermaid/);
 assert.doesNotMatch(svg(r,graph),/<script|onload=/);
});

test("git status counts are exact but architecture flow stays source-only",()=>{
 const r=analyzeChanges([{status:"A",path:"src/main.tsx"},{status:"M",path:"worker/violet-stone-api.ts"},{status:"D",path:"unmapped/old.js"}],graph);
 assert.deepEqual(r.change_summary,{added:1,modified:1,deleted:1,type_changed:0});
 assert.deepEqual(r.unmapped,["unmapped/old.js"]);
 assert.ok(r.edges.every(([a,b])=>graph.edges.some(e=>e[0]===a&&e[1]===b)));
 assert.match(svg(r,graph),/Diff facts/);
 assert.match(markdown(r),/Exact git file changes/);
 assert.throws(()=>analyzeChanges([{status:"X",path:"src/main.tsx"}],graph),/INVALID_STATUS/);
 assert.throws(()=>analyzeChanges([{status:"M",path:"src/main.tsx"},{status:"D",path:"src/main.tsx"}],graph),/DUPLICATE_FILE/);
});
