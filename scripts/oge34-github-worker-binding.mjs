import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const REPO = "Ogenicchocolate21debug/Build-Platform";
const BRANCH = "phase-vi-provider-incentive-metering";
const WORKER = "ogenic-phase-vi-staging";
const GITHUB_API = "https://api.github.com/repos/" + REPO;
const WAVE = "https://wave.ogenicchocolate.com";
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

export function inspectTokenFormat(value) {
  return typeof value === "string" && /^[\x21-\x7e]+$/.test(value);
}
// Owner-defined credentials for the SECOND GitHub account. The labels are not
// interchangeable, and the bytes must never be logged or copied between names.
export const RUNNER_TWO_PAT_BINDINGS = Object.freeze({
  "GH-ID-TOMLOAD-RUNNER-2": { type: "CLASSIC_PAT", prefix: "ghp_" },
  "GIT_HUB_RUNNER-2": { type: "FINE_GRAINED_PAT", prefix: "github_pat_" },
  // Alternate environment key spellings only; the Infisical names above remain canonical.
  "GH_ID_TOMLOAD_RUNNER_2": { type: "CLASSIC_PAT", prefix: "ghp_" },
  "GIT_HUB_RUNNER_2": { type: "FINE_GRAINED_PAT", prefix: "github_pat_" },
});
export function inspectRunnerTwoCredential(name, raw) {
  const binding = RUNNER_TWO_PAT_BINDINGS[name];
  if (!binding) return { recognized: false, type: "UNMAPPED", valid: false };
  return {
    recognized: true,
    type: binding.type,
    valid: inspectTokenFormat(raw) && raw.startsWith(binding.prefix),
  };
}
export function selectRunnerTwoAuthorizedCredential(authorized) {
  // Only choose after a real GitHub principal check and Actions-write canary.
  // Fine-grained PAT is narrower; Classic is a distinct fallback if proven.
  const candidates = authorized.filter(x => x.principal === "wave-runner-2");
  const fine = candidates.find(x => x.type === "FINE_GRAINED_PAT");
  if (fine) return fine;
  const classic = candidates.find(x => x.type === "CLASSIC_PAT");
  if (classic) return classic;
  return null;
}
export function classifyDispatchProbe(http) {
  if (http === 422) return "AUTHORIZED_INVALID_REF_NO_WORKFLOW_RUN";
  if (http === 403) return "ACTIONS_WRITE_DENIED";
  if (http === 404) return "WORKFLOW_UNAVAILABLE_OR_ACCESS_DENIED";
  if (http === 401) return "TOKEN_REAUTH_REQUIRED";
  return "UNVERIFIED_HTTP_" + http;
}
const responseJson = async (response) => await response.json().catch(() => ({}));
function requireStaging() {
  assert.equal(process.env.GITHUB_REPOSITORY, REPO, "REPO_SCOPE");
  assert.equal(process.env.GITHUB_REF_NAME, BRANCH, "STAGING_BRANCH_SCOPE");
  assert.equal(process.env.RUNNER_NAME, "wave-runner-01", "RUNNER_SCOPE");
  assert.equal(process.env.WORKER_NAME, WORKER, "WORKER_SCOPE");
  assert.equal(process.env.INFISICAL_PROJECT_ID, "e8cfba67-ea99-4d79-bc9f-87b862f9129c", "INFISICAL_PROJECT_SCOPE");
  assert.equal(process.env.INFISICAL_PROJECT_SLUG, "ogenic-sio-ti-rv", "INFISICAL_PROJECT_SLUG_SCOPE");
  assert.equal(process.env.INFISICAL_SECRET_ENV_SLUG, "staging", "INFISICAL_STAGING_SECRET_SCOPE");
  assert.equal(process.env.INFISICAL_SECRET_PATH, "/", "INFISICAL_SECRET_PATH_SCOPE");
}
async function githubRequest(path, token, options={}) {
  const url=GITHUB_API + path;
  for(let attempt=1;attempt<=3;attempt++){
    try{
      return await fetch(url,{
        ...options,
        headers:{
          "Authorization":"Bearer "+token,
          "Accept":"application/vnd.github+json",
          "Content-Type":"application/json",
          "X-GitHub-Api-Version":"2022-11-28",
          "User-Agent":"ogenic-oge34-staging-binding",
        },
        redirect:"error", signal:AbortSignal.timeout(15000),
      });
    }catch(error){
      if(attempt===3)throw new Error("GITHUB_NETWORK_UNAVAILABLE_AFTER_RETRIES");
      await delay(1000*attempt);
    }
  }
  throw new Error("GITHUB_NETWORK_UNAVAILABLE");
}
async function verifyOwnerRead() {
  const ownerKey=process.env.OGENIC_OPS_KEY || "";
  if (!ownerKey) throw new Error("OWNER_KEY_STAGING_BINDING_MISSING");
  let last=0, lastCode="NO_RESULT";
  for (let i=0;i<6;i++) {
    const auth=await fetch(WAVE+"/api/session",{
      method:"POST",headers:{"content-type":"application/json"},
      body:JSON.stringify({owner_key:ownerKey}),redirect:"error",signal:AbortSignal.timeout(15000)
    });
    const authBody=await responseJson(auth);
    if (auth.status!==200 || authBody.authenticated!==true) throw new Error("OWNER_SESSION_REJECTED_"+auth.status);
    const cookie=(auth.headers.get("set-cookie")||"").split(";",1)[0];
    if (!cookie.startsWith("ogenic_owner_session=")) throw new Error("OWNER_SESSION_COOKIE_MISSING");
    const read=await fetch(WAVE+"/api/wave/command",{
      method:"POST",headers:{"content-type":"application/json","cookie":cookie},
      body:JSON.stringify({intent:"Read the staging repository manifest",
        capability:"read_file",provider:"github",environment:"staging",input:{path:"package.json"}}),
      redirect:"error",signal:AbortSignal.timeout(15000)
    });
    const b=await responseJson(read);last=read.status;lastCode=String(b.code||"UNSPECIFIED").slice(0,70);
    if (read.status===200 && b.ok===true && b.verification?.status==="verified" &&
        b.resolver?.descriptor?.provider_id==="github" &&
        b.canonical?.session_line==="1LSS_OWNER_MAIN") {
      console.log("OGE34_WAVE_GITHUB_ENDPOINT_VERIFIED_READ=PASS");
      console.log("OGE34_STAGING_ONE_LINE_RECEIPT=PASS");
      return;
    }
    if(i<5) await delay(3000);
  }
  throw new Error("OGE34_WAVE_GITHUB_ENDPOINT_NOT_VERIFIED_HTTP_"+last+"_CODE_"+lastCode);
}
// Reuse GitHub auth that the Owner already configured for the `wave` host user.
// Do not touch /root, switch accounts, prompt OAuth, or reveal credentials in logs.
export function existingHostAuthCandidates(run = spawnSync, env = process.env) {
  if (env.RUNNER_NAME !== "wave-runner-01") return [];
  const localEnv = { ...env, GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "never" };
  for (const name of ["GH_TOKEN", "GITHUB_TOKEN", "GH_PAT", "GITHUB_PAT",
    "GIT_ASKPASS", "SSH_ASKPASS", "GITHUB_ACCESS_TOKEN"]) delete localEnv[name];
  const opts = { encoding: "utf8", timeout: 7000, maxBuffer: 4096, env: localEnv };
  const found = [];
  try {
    const result = run("gh", ["auth", "token", "--hostname", "github.com"], opts);
    const candidate = String(result.stdout || "").trim();
    if (result.status === 0 && inspectTokenFormat(candidate))
      found.push({ key: "RUNNER_WAVE_GH_CLI_AUTH", raw: candidate });
  } catch { /* gh CLI not configured for the existing wave user */ }
  try {
    const result = run("git", ["credential", "fill"], {
      ...opts, input: "protocol=https\nhost=github.com\n\n",
    });
    const password = String(result.stdout || "").split(/\r?\n/).find(line => line.startsWith("password="));
    const candidate = password?.slice("password=".length) ?? "";
    if (result.status === 0 && inspectTokenFormat(candidate))
      found.push({ key: "RUNNER_WAVE_GIT_CREDENTIAL_HELPER", raw: candidate });
  } catch { /* no noninteractive credential helper configured */ }
  return found;
}
// Stable GitHub numeric IDs are more reliable than emails, display names
// or guessed GitHub login spellings. GH-1 retains repository admin and Cloudflare
// credential custody; GH-2 is the primary WAVE Actions dispatch principal.
// A 200 from /user proves token validity, NOT the expected GitHub identity.
export const OWNER_GITHUB_IDENTITIES = Object.freeze({
  runner1: { id: 306097555, login: "ogenicchocolate21debug" },
  runner2: { id: 342175560, login: "wave-runner-2" },
});
export function classifyOwnerPrincipal(payload, expected = "either") {
  const id = Number(payload?.id);
  const login = String(payload?.login ?? "").toLowerCase();
  const one = OWNER_GITHUB_IDENTITIES.runner1;
  const two = OWNER_GITHUB_IDENTITIES.runner2;
  const first = id === one.id && login === one.login;
  const second = id === two.id && login === two.login;
  if (expected === "runner1") return first ? "runner1" : null;
  if (expected === "runner2") return second ? "runner2" : null;
  return first ? "runner1" : second ? "runner2" : null;
}
async function verifyExistingHostGitHubPrincipal(token, expected = "either") {
  const response = await fetch("https://api.github.com/user", {
    headers: {
      "Authorization": "Bearer " + token,
      "Accept": "application/vnd.github+json",
      "User-Agent": "ogenic-oge34-existing-host-auth",
    },
    redirect: "error", signal: AbortSignal.timeout(15000),
  }).catch(() => null);
  const payload = response?.status === 200 ? await responseJson(response) : {};
  const matched = classifyOwnerPrincipal(payload, expected);
  // Metadata only. Never print token bytes, response headers or personal emails.
  console.log("OGE34_PRINCIPAL_EXPECTED="+expected);
  console.log("OGE34_PRINCIPAL_HTTP="+String(response?.status ?? "NETWORK_ERROR"));
  console.log("OGE34_PRINCIPAL_MATCH="+(matched ? "YES" : "NO"));
  if (expected === "runner2") {
    console.log("OGE34_RUNNER2_PRINCIPAL_HTTP="+String(response?.status ?? "NETWORK_ERROR"));
    console.log("OGE34_RUNNER2_PRINCIPAL_MATCH="+(matched ? "YES" : "NO"));
  }
  return matched;
}

export async function main() {
  requireStaging();
  // Check only pre-existing Infisical staging GitHub credential bindings.
  // Select a single token proven for Actions WRITE; never print token bytes,
  // persist test tokens or substitute GitHub Actions' ephemeral github.token.
  const primaryNames=["GH-ID-TOMLOAD-RUNNER-2","GIT_HUB_RUNNER-2",
    "GH_ID_TOMLOAD_RUNNER_2","GIT_HUB_RUNNER_2",
    "GITHUB_TOKEN_OGE34","GIBHUB_TOKEN_OGE34","GITHUB_TOKEN",
    "GITHUB_PAT","GITHUB_ACCESS_TOKEN","GH_TOKEN","GH_PAT","WAVE_GITHUB_TOKEN"];
  const discovered=Object.keys(process.env).filter((k) =>
    (/GITHUB/.test(k) && /(?:^|_)(?:TOKEN|PAT|AUTH|CREDENTIAL)(?:_|$)/.test(k)) ||
    /^(GH_TOKEN|GH_PAT|GH-ID-TOMLOAD-RUNNER-2|GIT_HUB_RUNNER-2|GH_ID_TOMLOAD_RUNNER_2|GIT_HUB_RUNNER_2)$/.test(k));
  const keys=[...new Set([...primaryNames,...discovered])].filter((k) =>
    Object.prototype.hasOwnProperty.call(process.env,k) && String(process.env[k]||"").length>0
  ).slice(0,24);
  // Metadata only. Does not print token contents, fragments, hashes or prefixes.
  console.log("OGE34_INFISICAL_GITHUB_CANDIDATE_KEYS="+JSON.stringify(keys));
  console.log("OGE34_RUNNER2_CREDENTIAL_BINDINGS="+JSON.stringify(
    Object.keys(RUNNER_TWO_PAT_BINDINGS).filter(key => keys.includes(key)).map(key => ({
      name: key,
      type: RUNNER_TWO_PAT_BINDINGS[key].type,
      format: inspectRunnerTwoCredential(key, process.env[key]).valid ? "MATCH" : "MISMATCH",
    }))
  ));
  const local = existingHostAuthCandidates();
  console.log("OGE34_RUNNER_EXISTING_GITHUB_AUTH_CANDIDATES="+JSON.stringify(local.map(row => row.key)));
  const candidates = [
    ...keys.map(key => ({ key, raw: String(process.env[key] || ""), hostLocal: false })),
    ...local.map(row => ({ ...row, hostLocal: true })),
  ];
  const seen=new Set();
  const authorized=[];
  for(const {key, raw, hostLocal} of candidates){
    const recognized = inspectRunnerTwoCredential(key, raw);
    if (recognized.recognized && !recognized.valid) {
      console.log("OGE34_CANDIDATE_"+key+"_FORMAT_MISMATCH="+recognized.type);
      continue;
    }
    // GITHUB_TOKEN_OGE34 is GH-1 (Tawatchai, admin), not the dispatch primary.
    // GH-ID-TOMLOAD-RUNNER-2 and GIT_HUB_RUNNER-2 belong to primary GH-2 (Tomload21).
    // Never conflate repository roles with token scope or assume email=login.
    const expectedPrincipal = recognized.recognized ? "runner2"
      : (key === "GITHUB_TOKEN_OGE34" || key === "GIBHUB_TOKEN_OGE34") ? "runner1" : "either";
    const variants=[{type:"EXACT",value:raw}];
    // OGE-40 proved the canonical value contains control characters. Check
    // whether it is merely line-wrapped; do not overwrite Infisical or guess
    // any character other than removable CR/LF whitespace.
    if(!inspectTokenFormat(raw)){
      const trim=raw.trim();
      const unwrapped=raw.replace(/[\r\n]/g,"").trim();
      if(inspectTokenFormat(trim))variants.push({type:"TRIM_OUTER_WHITESPACE",value:trim});
      if(inspectTokenFormat(unwrapped)&&unwrapped!==trim)variants.push({type:"REMOVE_CRLF_LINEBREAKS",value:unwrapped});
    }
    if(variants.every(v=>!inspectTokenFormat(v.value))){
      console.log("OGE34_CANDIDATE_"+key+"=REJECTED_FORMAT");
      continue;
    }
    for(const variant of variants){
      const candidate=variant.value;
      if(!inspectTokenFormat(candidate)||seen.has(candidate))continue;
      seen.add(candidate);
      console.log("::add-mask::"+candidate);
      const label=key+"_"+variant.type;
      // The old OGE token may contain CR/LF. Verify identity only AFTER
      // selecting a strictly valid, bounded normalization candidate.
      const verifiedPrincipal = await verifyExistingHostGitHubPrincipal(candidate, expectedPrincipal);
      if (!verifiedPrincipal) {
        console.log("OGE34_CANDIDATE_"+label+(expectedPrincipal === "runner2"
          ? "_RUNNER2_PRINCIPAL_UNVERIFIED" : "_OWNER_PRINCIPAL_UNVERIFIED"));
        continue;
      }
      const branch=await githubRequest("/branches/"+BRANCH,candidate);
      if(branch.status!==200){
        console.log("OGE34_CANDIDATE_"+label+"_BRANCH_HTTP="+branch.status);
        continue;
      }
      const actions=await githubRequest("/actions/runs?branch="+BRANCH+"&per_page=1",candidate);
      if(actions.status!==200){
        console.log("OGE34_CANDIDATE_"+label+"_ACTIONS_READ_HTTP="+actions.status);
        continue;
      }
      const ref="__OGENIC_UNRESOLVABLE_REF_"+process.env.GITHUB_RUN_ID+"_"+process.env.GITHUB_RUN_ATTEMPT+"__";
      const request=await githubRequest("/actions/workflows/wave-command-consumer.yml/dispatches",candidate,{
        method:"POST",body:JSON.stringify({ref,inputs:{task_id:"not_an_approved_task"}})
      });
      const result=classifyDispatchProbe(request.status);
      console.log("OGE34_CANDIDATE_"+label+"_DISPATCH_HTTP="+request.status);
      console.log("OGE34_CANDIDATE_"+label+"_RESULT="+result);
      const permissionHeader=request.headers.get("x-accepted-github-permissions");
      if(permissionHeader && /^[A-Za-z0-9,=; _-]{1,150}$/.test(permissionHeader)){
        console.log("OGE34_CANDIDATE_"+label+"_REQUIRED_PERMISSION="+permissionHeader);
      }
      if(result==="AUTHORIZED_INVALID_REF_NO_WORKFLOW_RUN")authorized.push({
        key:label, token:candidate, type:recognized.recognized ? recognized.type : "LEGACY",
        principal: verifiedPrincipal === "runner2" ? "wave-runner-2" : "ogenicchocolate21debug",
      });
    }
  }
  if(authorized.length===0)throw new Error("STAGING_SECRET_NOT_CHANGED_ACTIONS_WRITE_DENIED_ALL_EXISTING_GITHUB_CANDIDATES");
  // Do not merge Classic and fine-grained PATs, or treat Runner-1 as Runner-2.
  // Prefer a verified fine-grained Runner-2 PAT; separately verified Classic PAT
  // is eligible only when fine-grained cannot dispatch. Ambiguous legacy tokens
  // fail closed as before.
  // GH-2 is the operational primary for WAVE Actions dispatch. GH-1
  // admin/Cloudflare credentials must not silently become the runtime PAT.
  const chosen=selectRunnerTwoAuthorizedCredential(authorized);
  if (!chosen) throw new Error("STAGING_SECRET_NOT_CHANGED_GH2_ACTIONS_WRITE_NOT_VERIFIED");
  const token=chosen.token;
  console.log("OGE34_VERIFIED_TOKEN_SOURCE="+chosen.key);
  console.log("OGE34_VERIFIED_TOKEN_TYPE="+chosen.type);
  console.log("OGE34_DISPATCH_SCOPE=AUTHORIZED_INVALID_REF_NO_WORKFLOW_RUN");
  // Called by the EXISTING staging deploy workflow. Verify GH-2's numeric
  // principal + Actions-write canary, then export the vetted PAT to GitHub's
  // transient job environment; its protected runtime bundle carries the secret.
  // Do not expose the token in logs, source, D1 or artifacts.
  if (process.env.OGE34_EXPORT_CANONICAL === "1") {
    const envFile = String(process.env.GITHUB_ENV || "");
    if (!envFile) throw new Error("STAGING_GITHUB_ENV_FILE_MISSING");
    appendFileSync(envFile, "GITHUB_TOKEN=" + token + "\nOGE34_GH2_PRIMARY_BOUND=1\n", { mode: 0o600 });
    console.log("OGE34_GH2_PRIMARY_FOR_STAGING_DEPLOY=VERIFIED_ACTIONS_WRITE");
    return;
  }
  if(!process.env.CLOUDFLARE_API_TOKEN||!process.env.CLOUDFLARE_ACCOUNT_ID){
    throw new Error("CLOUDFLARE_STAGING_CREDENTIALS_MISSING");
  }
  const put=spawnSync("npx",["--yes","wrangler","secret","put","GITHUB_TOKEN","--name",WORKER],{
    input:token,encoding:"utf8",env:process.env,timeout:140000,maxBuffer:2097152
  });
  if(put.status!==0)throw new Error("CLOUDFLARE_STAGING_SECRET_PUT_FAILED_EXIT_"+String(put.status));
  console.log("OGE34_STAGING_WORKER_GITHUB_TOKEN_BINDING=UPDATED");
  const health=await fetch(WAVE+"/api/health",{redirect:"error",signal:AbortSignal.timeout(15000)});
  const hb=await responseJson(health);
  if(health.status!==200||hb.ok!==true)throw new Error("STAGING_HEALTH_FAILED_"+health.status);
  console.log("OGE34_STAGING_HEALTH=PASS");
  await verifyOwnerRead();
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
  main().catch(e=>{console.error("::error::"+String(e.message||e).slice(0,240));process.exitCode=1;});
}
