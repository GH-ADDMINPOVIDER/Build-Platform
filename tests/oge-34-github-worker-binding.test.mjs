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
  assert.match(src,/GH_ADDMINPROVIDER/);
  assert.match(src,/GITHUB_CANDIDATE_KEYS/);
  assert.match(src,/STAGING_SECRET_NOT_CHANGED_GH_ADDMINPROVIDER_ACTIONS_WRITE_NOT_VERIFIED/);
  assert.match(src,/STAGING_SECRET_NOT_CHANGED_/);
  assert.match(src,/UNRESOLVABLE_REF_/);
  assert.match(src,/wrangler","secret","put","GITHUB_TOKEN"/);
  assert.match(src,/UNIFIEND_GITHUB_ENDPOINT_VERIFIED_READ/);
});

test("reuses only existing unifiend-host CLI and git credential helper without inherited action tokens",()=>{
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
  assert.deepEqual(rows.map(x=>x.key),["RUNNER_UNIFIEND_GH_CLI_AUTH","RUNNER_UNIFIEND_GIT_CREDENTIAL_HELPER"]);
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

test("the canonical GitHub provider is the only typed dispatch credential",()=>{
  const {RUNNER_TWO_PAT_BINDINGS,inspectRunnerTwoCredential}=hostAuth;
  assert.deepEqual(inspectRunnerTwoCredential("GH_ADDMINPROVIDER-FINE_GRAINED","github_pat_testValue1234"),
    {recognized:true,type:"PAT",valid:true});
  assert.equal(Object.keys(RUNNER_TWO_PAT_BINDINGS).length,1);
  assert.equal(inspectRunnerTwoCredential("RETIRED_STORE_CREDENTIAL","github_pat_testValue").valid,false);
});
test("canonical provider is selected and retired credentials are rejected",()=>{
  const {selectRunnerTwoAuthorizedCredential: select}=hostAuth;
  const canonical={key:"GH_ADDMINPROVIDER-FINE_GRAINED_EXACT",token:"github_pat_test",type:"PAT",principal:"wave-runner-2"};
  const other={key:"RETIRED_STORE_CREDENTIAL_EXACT",token:"ghp_other",type:"LEGACY",principal:"ogenicchocolate21debug"};
  assert.equal(select([canonical]),canonical);
  assert.equal(select([other]),null);
  assert.equal(select([]),null);
});
test("only Runner-2 PAT keys have explicitly matched prefixes; no bytes logged or converted",()=>{
  const src=readFileSync("scripts/oge34-github-worker-binding.mjs","utf8");
  assert.match(src,/RUNNER2_PRINCIPAL_UNVERIFIED/);
  assert.match(src,/OGE34_VERIFIED_TOKEN_TYPE/);
  assert.doesNotMatch(src,/\.replace\(\/github_pat_/);
});

test("the canonical provider remains bound to the operational Actions principal",()=>{
  const { OWNER_GITHUB_IDENTITIES, classifyOwnerPrincipal } = hostAuth;
  assert.equal(OWNER_GITHUB_IDENTITIES.store.id,306097555);
  assert.equal(OWNER_GITHUB_IDENTITIES.capability.id,342175560);
  const tawatchai={ id:306097555, login:"Ogenicchocolate21debug" };
  const tomload={ id:342175560, login:"Wave-Runner-2" };
  assert.equal(classifyOwnerPrincipal(tawatchai,"store"),"store");
  assert.equal(classifyOwnerPrincipal(tawatchai,"capability"),null);
  assert.equal(classifyOwnerPrincipal(tomload,"capability"),"capability");
  assert.equal(classifyOwnerPrincipal(tomload,"store"),null);
  assert.equal(classifyOwnerPrincipal({id:342175560,login:"unifiend_runner-2"},"capability"),null);
  assert.equal(classifyOwnerPrincipal({id:306097555,login:"Wave-Runner-2"},"either"),null);
  assert.equal(classifyOwnerPrincipal({id:342175560,login:"tomload21"},"capability"),null);
});
test("the canonical provider is principal-verified before dispatch",()=>{
  const src=readFileSync("scripts/oge34-github-worker-binding.mjs","utf8");
  assert.match(src,/recognized\.recognized \? "capability"/);
  assert.match(src,/await verifyExistingHostGitHubPrincipal\(candidate, expectedPrincipal\)/);
  assert.match(src,/principal: verifiedPrincipal === "capability"/);
  assert.match(src,/wave-runner-2/);
  assert.doesNotMatch(src,/\["unifiend_runner-2", "tomload21"\]/);
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

test("Unifiend safe READ smoke uses ordinary file intent, not a blocked credential-like phrase",()=>{
  const source=readFileSync("scripts/oge34-github-worker-binding.mjs","utf8");
  assert.match(source,/Read the staging repository manifest/);
  assert.doesNotMatch(source,/Validate staging GitHub endpoint credential binding via verified READ/);
  assert.match(source,/capability:"read_file",provider:"github",environment:"staging"/);
});

test("Unifiend staging deploy must preserve GH_ADDMINPROVIDER as the primary GitHub Actions credential", () => {
  const deploy=readFileSync(".github/workflows/provider-incentive-staging-deploy.yml","utf8");
  const script=readFileSync("scripts/oge34-github-worker-binding.mjs","utf8");
  const selection=deploy.indexOf('name: Verify Unifiend capability Actions-write');
  const runtime=deploy.indexOf('name: Prepare protected runtime secret bundle');
  const deployment=deploy.indexOf('name: Deploy staging Worker with protected bindings');
  assert.ok(selection > 0 && runtime > selection && deployment > runtime);
  assert.match(deploy, /OGE34_EXPORT_CANONICAL: "1"/);
  assert.match(deploy, /OGE34_GH_ADDMINPROVIDER_BOUND/);
  assert.doesNotMatch(deploy, /proven_github = os.environ.get\('RETIRED_STORE_CREDENTIAL'\)/);
  assert.match(script, /selectRunnerTwoAuthorizedCredential\(authorized\)/);
  assert.doesNotMatch(script, /authorized.length===1 \? authorized\[0\]/);
  assert.match(script, /STAGING_SECRET_NOT_CHANGED_GH_ADDMINPROVIDER_ACTIONS_WRITE_NOT_VERIFIED/);
  assert.match(script, /appendFileSync\(envFile/);
  assert.match(script, /OGE34_GH_ADDMINPROVIDER_FOR_STAGING_DEPLOY=VERIFIED_ACTIONS_WRITE/);
  assert.match(script, /AUTHORIZED_INVALID_REF_NO_WORKFLOW_RUN/);
  assert.match(deploy, /INFISICAL_CLOUDFLARE_SOURCE_ENV: staging/);
  assert.match(deploy, /wrangler deploy --config .*--secrets-file/);
});

test("Cloudflare custody and canonical operational write are not conflated", () => {
  const script=readFileSync("scripts/oge34-github-worker-binding.mjs","utf8");
  assert.match(script, /store: \{ id: 306097555/);
  assert.match(script, /capability: \{ id: 342175560/);
  assert.match(script, /verifyExistingHostGitHubPrincipal\(candidate, expectedPrincipal\)/);
  assert.equal(hostAuth.selectRunnerTwoAuthorizedCredential([{ key: hostAuth.CANONICAL_GITHUB_CREDENTIAL + "_EXACT", principal: "ogenicchocolate21debug" }]), null);
});
