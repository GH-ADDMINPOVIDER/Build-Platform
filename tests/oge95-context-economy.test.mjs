import test from "node:test";
import assert from "node:assert/strict";
import {pack,unpack,previewForAgent} from "../scripts/oge95-context-economy.mjs";
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

test("optional agent preview is fully preserved or returns a reference instead of truncation",()=>{
 const raw=["loading","loading","FAIL: stale commit","APPROVAL_REQUIRED"].join("\n");
 const ready=previewForAgent(raw,{maxChars:4000});
 assert.equal(ready.status,"PREVIEW_READY");
 assert.match(ready.preview,/FAIL: stale commit/);
 assert.match(ready.preview,/APPROVAL_REQUIRED/);
 assert.equal(ready.verified_reversible,true);
 assert.equal(ready.measured_tokens,false);
 const large=previewForAgent(raw,{maxChars:4});
 assert.equal(large.status,"REFERENCE_REQUIRED");
 assert.equal(large.preview,null);
 assert.equal(large.source_sha256,ready.source_sha256);
 assert.throws(()=>previewForAgent(raw,{maxChars:0}),/INVALID_PREVIEW_BUDGET/);
});
test("sensitive fields are not placed into a context preview",()=>{
 const raw=["metadata","password",":"," masked"].join("");
 const p=previewForAgent(raw,{maxChars:4000});
 assert.equal(p.status,"REDACTION_REQUIRED");
 assert.equal(p.preview,null);
});
