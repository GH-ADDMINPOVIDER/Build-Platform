import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {analyze,svg,markdown} from "../scripts/oge95-review-visual.mjs";
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
