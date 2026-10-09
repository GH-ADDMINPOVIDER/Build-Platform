import test from "node:test";
import assert from "node:assert/strict";
import {pack,unpack} from "../scripts/oge95-context-economy.mjs";
test("noncritical duplicates are compact and exactly restorable",()=>{
 const s=["start",...Array(50).fill("cache ready"),"FAIL: stale SHA"].join("\n");
 const p=pack(s);
 assert.ok(p.preview_chars<p.original_chars);
 assert.equal(unpack(p),s);
 assert.match(p.preview,/FAIL: stale SHA/);
});
test("errors, approvals, SHA identifiers remain uncollapsed",()=>{
 const sha="a".repeat(40),s=["APPROVAL_REQUIRED","APPROVAL_REQUIRED",sha,sha].join("\n");
 const p=pack(s);
 assert.equal(p.items.length,4);
 assert.equal(unpack(p),s);
});
test("tampering fails and invalid input is rejected",()=>{
 const p=pack("a\na");p.items[0].line="changed";
 assert.throws(()=>unpack(p),/SOURCE_HASH_MISMATCH/);
 assert.throws(()=>pack(null),/INVALID_INPUT/);
});
