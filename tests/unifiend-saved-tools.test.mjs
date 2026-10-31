import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectSavedTools } from '../scripts/unifiend-saved-tools.mjs';
test('star discovery is bounded GET-only and reports truthful links without arbitrary fields',async()=>{
 const calls=[];
 const result=await inspectSavedTools({headers:{Authorization:'synthetic'},request:async(url,init)=>{
  calls.push(url);assert.equal(init.method,undefined);assert.equal(init.redirect,'manual');
  return Response.json([{full_name:'vendor/terminal',description:'private-unused',secret:'unused'}, {full_name:'bad url',description:'terminal'}, {full_name:'vendor/other',description:'unrelated'}]);
 }});
 assert.equal(calls.length,2);assert.ok(result.every(r=>r.complete));
 assert.deepEqual(result[0].tools,[{full_name:'vendor/terminal',url:'https://github.com/vendor/terminal'}]);
 assert.equal(JSON.stringify(result).includes('private-unused'),false);
});
test('denied stars are unavailable, not an empty verified inventory',async()=>{
 const result=await inspectSavedTools({headers:{},request:async()=>Response.json({}, {status:403})});
 assert.ok(result.every(r=>r.state==='READ_UNAVAILABLE'&&!r.complete&&r.http_status===403));
});
