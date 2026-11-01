import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
test('real shell accepts only GH-ADDMINPOVIDER and exact canonical numeric identities',()=>{
 const home=mkdtempSync(join(tmpdir(),'unifiend-host-scope-'));
 try{
  writeFileSync(join(home,'node'),'#!/bin/sh\nprintf "FIXTURE_CONSUMER_INVOKED\\n"\n',{mode:0o700});
  const env={PATH:home+':/usr/bin:/bin',HOME:home,RUNNER_NAME:'GH-ADDMINPOVIDER',GITHUB_REF_NAME:'Unified-on-Progress',GITHUB_REPOSITORY_ID:'1429580446',GITHUB_REPOSITORY_OWNER_ID:'342175560',UNIFIEND_TASK_ID:'wavecmd_'+'a'.repeat(64)};
  const run=patch=>spawnSync('/bin/bash',['scripts/unifiend-terminal-solo.sh'],{env:{...env,...patch},encoding:'utf8'});
  const ok=run({});assert.equal(ok.status,0,ok.stderr);assert.match(ok.stdout,/FIXTURE_CONSUMER_INVOKED/);
  for(const patch of [{RUNNER_NAME:'historical-host'},{GITHUB_REPOSITORY_OWNER_ID:'306097555'},{GITHUB_REPOSITORY_ID:'1'},{GITHUB_REF_NAME:'main'}]){
   const result=run(patch);assert.equal(result.status,78);assert.doesNotMatch(result.stdout,/FIXTURE_CONSUMER_INVOKED/);
  }
 }finally{rmSync(home,{recursive:true,force:true});}
});
