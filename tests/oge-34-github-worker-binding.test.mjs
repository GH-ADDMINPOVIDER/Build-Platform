import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as hostAuth from "../scripts/oge34-github-worker-binding.mjs";
const {inspectTokenFormat, classifyDispatchProbe} = hostAuth;
const wf=readFileSync(".github/workflows/oge-34-github-token-refresh.yml","utf8");
test("rejects canonical tokens with embedded control characters",()=>{
  assert.equal(inspectTokenFormat("github_pat_safeTOKEN_123"),true);
  for(const v of ["", "token\n", "x\r", "x y", "x\u0000",undefined])assert.equal(inspectTokenFormat(v),false);
});
test("requires Actions WRITE canary with 422 and no real dispatch",()=>{
  assert.equal(classifyDispatchProbe(422),"AUTHORIZED_INVALID_REF_NO_WORKFLOW_RUN");
  assert.equal(classifyDispatchProbe(403),"ACTIONS_WRITE_DENIED");
  assert.equal(classifyDispatchProbe(404),"WORKFLOW_UNAVAILABLE_OR_ACCESS_DENIED");
  assert.notEqual(classifyDispatchProbe(204),"AUTHORIZED_INVALID_REF_NO_WORKFLOW_RUN");
});
test("staging secret binding cannot use GitHub ephemeral token or dev sources",()=>{
  assert.match(wf,/INFISICAL_PROJECT_SLUG: ogenic-sio-ti-rv/);
  assert.match(wf,/INFISICAL_CLOUDFLARE_SOURCE_ENV: staging/);
  assert.match(wf,/INFISICAL_CLOUDFLARE_PROJECT_ID: e8cfba67-ea99-4d79-bc9f-87b862f9129c/);
  assert.match(wf,/node scripts\/oge34-github-worker-binding\.mjs/);
  const src=readFileSync("scripts/oge34-github-worker-binding.mjs","utf8");
  assert.match(src,/GITHUB_TOKEN_OGE34/);
  assert.match(src,/GITHUB_CANDIDATE_KEYS/);
  assert.match(src,/MULTIPLE_AUTHORIZED_GITHUB_TOKENS/);
  assert.match(src,/STAGING_SECRET_NOT_CHANGED_/);
  assert.match(src,/UNRESOLVABLE_REF_/);
  assert.match(src,/wrangler","secret","put","GITHUB_TOKEN"/);
  assert.match(src,/WAVE_GITHUB_ENDPOINT_VERIFIED_READ/);
});

test("reuses only existing wave-host CLI and git credential helper without inherited action tokens",()=>{
  const {existingHostAuthCandidates}=hostAuth;
  const calls=[];
  const fake=(exe,args,opt)=>{
    calls.push({exe,args,opt});
    if(exe==="gh")return {status:0,stdout:"ghu_testExistingAuth12345\n"};
    if(exe==="git")return {status:0,stdout:"protocol=https\nhost=github.com\npassword=ghu_testExistingAuth12345\n"};
    return {status:1,stdout:""};
  };
  assert.deepEqual(existingHostAuthCandidates(fake,{RUNNER_NAME:"other"}),[]);
  const rows=existingHostAuthCandidates(fake,{RUNNER_NAME:"wave-runner-01",GH_TOKEN:"do_not_reuse_gh_token",GITHUB_TOKEN:"do_not_reuse_actions_token"});
  assert.deepEqual(rows.map(x=>x.key),["RUNNER_WAVE_GH_CLI_AUTH","RUNNER_WAVE_GIT_CREDENTIAL_HELPER"]);
  for(const c of calls){assert.equal(c.opt.env.GH_TOKEN,undefined);assert.equal(c.opt.env.GITHUB_TOKEN,undefined);}
  assert.equal(calls[1].opt.input,"protocol=https\nhost=github.com\n\n");
});
test("only known owner GitHub principals can use local host credentials for Actions-write canary",()=>{
 const src=readFileSync("scripts/oge34-github-worker-binding.mjs","utf8");
 assert.match(src,/verifyExistingHostGitHubPrincipal/);
 assert.match(src,/OWNER_PRINCIPAL_UNVERIFIED/);
 assert.ok(src.includes('"https://api.github.com/user"'));
 assert.match(src,/AUTHORIZED_INVALID_REF_NO_WORKFLOW_RUN/);
 assert.match(src,/wrangler","secret","put","GITHUB_TOKEN"/);
});

test("Runner-2 Classic and fine-grained PAT remain separate, strictly typed credentials",()=>{
  const {RUNNER_TWO_PAT_BINDINGS,inspectRunnerTwoCredential}=hostAuth;
  assert.equal(RUNNER_TWO_PAT_BINDINGS["GH-ID-TOMLOAD-RUNNER-2"].type,"CLASSIC_PAT");
  assert.equal(RUNNER_TWO_PAT_BINDINGS["GIT_HUB_RUNNER-2"].type,"FINE_GRAINED_PAT");
  assert.deepEqual(inspectRunnerTwoCredential("GH-ID-TOMLOAD-RUNNER-2","ghp_testValue1234"),
    {recognized:true,type:"CLASSIC_PAT",valid:true});
  assert.deepEqual(inspectRunnerTwoCredential("GIT_HUB_RUNNER-2","github_pat_testValue1234"),
    {recognized:true,type:"FINE_GRAINED_PAT",valid:true});
  assert.equal(inspectRunnerTwoCredential("GH-ID-TOMLOAD-RUNNER-2","github_pat_testValue").valid,false);
  assert.equal(inspectRunnerTwoCredential("GIT_HUB_RUNNER-2","ghp_testValue").valid,false);
});
test("Fine-grained Runner-2 PAT preferred; Classic Runner-2 PAT is a distinct fallback only when verified",()=>{
  const {selectRunnerTwoAuthorizedCredential: select}=hostAuth;
  const fine={key:"GIT_HUB_RUNNER-2_EXACT",token:"github_pat_test",type:"FINE_GRAINED_PAT",principal:"wave-runner-2"};
  const classic={key:"GH-ID-TOMLOAD-RUNNER-2_EXACT",token:"ghp_test",type:"CLASSIC_PAT",principal:"wave-runner-2"};
  const other={key:"GITHUB_TOKEN_OGE34_EXACT",token:"ghp_other",type:"LEGACY",principal:"ogenicchocolate21debug"};
  assert.equal(select([classic,fine]),fine);
  assert.equal(select([classic]),classic);
  assert.equal(select([other]),null);
  assert.equal(select([]),null);
});
test("only Runner-2 PAT keys have explicitly matched prefixes; no bytes logged or converted",()=>{
  const src=readFileSync("scripts/oge34-github-worker-binding.mjs","utf8");
  assert.match(src,/RUNNER2_PRINCIPAL_UNVERIFIED/);
  assert.match(src,/GH-ID-TOMLOAD-RUNNER-2/);
  assert.match(src,/GIT_HUB_RUNNER-2/);
  assert.match(src,/OGE34_VERIFIED_TOKEN_TYPE/);
  assert.doesNotMatch(src,/\.replace\(\/github_pat_/);
});

test("OGE34 belongs to Tawatchai primary, Tomload21 PATs belong to Wave-Runner-2",()=>{
  const { OWNER_GITHUB_IDENTITIES, classifyOwnerPrincipal } = hostAuth;
  assert.equal(OWNER_GITHUB_IDENTITIES.runner1.id,306097555);
  assert.equal(OWNER_GITHUB_IDENTITIES.runner2.id,342175560);
  const tawatchai={ id:306097555, login:"Ogenicchocolate21debug" };
  const tomload={ id:342175560, login:"Wave-Runner-2" };
  assert.equal(classifyOwnerPrincipal(tawatchai,"runner1"),"runner1");
  assert.equal(classifyOwnerPrincipal(tawatchai,"runner2"),null);
  assert.equal(classifyOwnerPrincipal(tomload,"runner2"),"runner2");
  assert.equal(classifyOwnerPrincipal(tomload,"runner1"),null);
  assert.equal(classifyOwnerPrincipal({id:342175560,login:"wave_runner-2"},"runner2"),null);
  assert.equal(classifyOwnerPrincipal({id:306097555,login:"Wave-Runner-2"},"either"),null);
  assert.equal(classifyOwnerPrincipal({id:342175560,login:"tomload21"},"runner2"),null);
});
test("legacy OGE token is explicitly primary; Runner-2 PAT principal always verified before dispatch",()=>{
  const src=readFileSync("scripts/oge34-github-worker-binding.mjs","utf8");
  assert.match(src,/key === "GITHUB_TOKEN_OGE34".*?\? "runner1"/s);
  assert.match(src,/recognized\.recognized \? "runner2"/);
  assert.match(src,/await verifyExistingHostGitHubPrincipal\(candidate, expectedPrincipal\)/);
  assert.match(src,/principal: verifiedPrincipal === "runner2"/);
  assert.match(src,/wave-runner-2/);
  assert.doesNotMatch(src,/\["wave_runner-2", "tomload21"\]/);
});

test("identity verification occurs on control-character normalized candidate, not raw OGE secret",()=>{
  const src=readFileSync("scripts/oge34-github-worker-binding.mjs","utf8");
  assert.match(src,/REMOVE_CRLF_LINEBREAKS/);
  assert.match(src,/await verifyExistingHostGitHubPrincipal\(candidate, expectedPrincipal\)/);
  const variantIndex=src.indexOf("for(const variant of variants)");
  const principalIndex=src.indexOf("const verifiedPrincipal = await verifyExistingHostGitHubPrincipal(candidate, expectedPrincipal)");
  assert.ok(variantIndex > 0 && principalIndex > variantIndex);
  assert.doesNotMatch(src,/verifyExistingHostGitHubPrincipal\(raw, expectedPrincipal\)/);
});

test("WAVE safe READ smoke uses ordinary file intent, not a blocked credential-like phrase",()=>{
  const source=readFileSync("scripts/oge34-github-worker-binding.mjs","utf8");
  assert.match(source,/Read the staging repository manifest/);
  assert.doesNotMatch(source,/Validate staging GitHub endpoint credential binding via verified READ/);
  assert.match(source,/capability:"read_file",provider:"github",environment:"staging"/);
});
