import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { spawnSync } from "node:child_process";

const API = "https://app.infisical.com";
const NAME = "Key-token-Ownner-Ops_e579";
const ENV = "staging";
const FOLDER = "/tmn-owner-ops-e579";
const PROJECT_SLUG = process.env.INFISICAL_PROJECT_SLUG || "ogenic-sio-ti-rv";
const IDENTITY_ID = process.env.INFISICAL_IDENTITY_ID;
const ORG_ID = process.env.INFISICAL_ORG_ID;
const ORG_SLUG = process.env.INFISICAL_ORG_SLUG;

function status(label, code) { console.log(label + "=" + code); }
function halt(code) { console.error("OWNER_OPS_E579_STOP=" + code); process.exitCode = 1; throw Error("STOP_REDACTED"); }
function digest(value) { return createHash("sha256").update(value).digest("hex"); }
function equal(a,b) {
  const x=Buffer.from(a); const y=Buffer.from(b);
  return x.length===y.length && timingSafeEqual(x,y);
}
async function jsonResponse(url, init) {
  const r = await fetch(url, { ...init, signal: AbortSignal.timeout(16000) });
  const data = await r.json().catch(() => ({}));
  return { code: r.status, data };
}
function payload(headers, body) {
  return { method: "POST", headers: { ...headers, "Content-Type":"application/json" }, body: JSON.stringify(body) };
}
function dockerDigest(value) {
  const r=spawnSync("docker",[
    "run","--rm","--network","none","--read-only","--cap-drop=ALL",
    "--security-opt=no-new-privileges","--memory=64m","--pids-limit=32",
    "-i","alpine:3.20","sha256sum"
  ],{ input: value, encoding:"utf8", timeout:60000, maxBuffer:2048 });
  if (r.status !== 0) halt("DOCKER_STDIN_READONLY_FAILED");
  const observed = (r.stdout || "").trim().split(/\s+/)[0];
  if (!equal(observed,digest(value))) halt("DOCKER_SHA256_MISMATCH");
  return true;
}
async function main() {
  if (!IDENTITY_ID || !ORG_SLUG || !ORG_ID ||
      !process.env.ACTIONS_ID_TOKEN_REQUEST_URL ||
      !process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN) halt("OIDC_INPUTS_MISSING");
  if(process.env.GITHUB_REPOSITORY !== "Wave-Runner-2/Build-Platform" ||
     process.env.GITHUB_REF_NAME !== "test/owner-report-40-images-docker-roundtrip-20261023") halt("GH2_STAGING_REF_REQUIRED");
  const oidc = await jsonResponse(process.env.ACTIONS_ID_TOKEN_REQUEST_URL,{
    headers: { Authorization: "Bearer " + process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN }
  });
  const jwt=oidc.data?.value;
  if (oidc.code !== 200 || typeof jwt !== "string") halt("GITHUB_OIDC_UNAVAILABLE");
  const login=await jsonResponse(API+"/api/v1/auth/oidc-auth/login",
    payload({}, {identityId: IDENTITY_ID, jwt, organizationSlug: ORG_SLUG}));
  const access=login.data?.accessToken;
  if (login.code !== 200 || typeof access!=="string") halt("INFISICAL_OIDC_DENIED_HTTP_"+login.code);
  status("GH2_INFISICAL_OIDC", "PASS");
  const headers={ Authorization:"Bearer "+access };
  const projects=await jsonResponse(API+"/api/v1/projects",{headers});
  if (projects.code!==200) halt("PROJECT_DISCOVERY_DENIED_HTTP_"+projects.code);
  const selected=(projects.data?.projects||[]).filter(p=>p.orgId===ORG_ID && p.slug===PROJECT_SLUG);
  if(selected.length!==1 || !selected[0].id) halt("PROJECT_IDENTITY_NOT_UNIQUE");
  const projectId=selected[0].id;
  status("INFISICAL_PROJECT_SCOPE", "CONFIRMED_STAGING");
  // Isolated folder: don't inject a new key into workflows that read all root secrets.
  const dirs=await jsonResponse(API+"/api/v1/folders?workspaceId="+encodeURIComponent(projectId)+"&environment="+ENV+"&path=%2F",{headers});
  if (dirs.code!==200) halt("FOLDER_DISCOVERY_DENIED_HTTP_"+dirs.code);
  const listing=Array.isArray(dirs.data?.folders)?dirs.data.folders:[];
  const folderName=FOLDER.slice(1);
  if (!listing.some(f=>f.name===folderName || f.path===FOLDER)) {
    const makeFolder=await jsonResponse(API+"/api/v1/folders",
       payload(headers,{workspaceId:projectId,environment:ENV,name:folderName,path:"/",description:"GH2 owner ops e579 isolated staging credential scope"}));
    if (![200,201,409].includes(makeFolder.code)) halt("CREATE_SCOPED_FOLDER_HTTP_"+makeFolder.code);
  }
  const endpoint=API+"/api/v4/secrets/"+encodeURIComponent(NAME);
  const query="?projectId="+encodeURIComponent(projectId)+"&environment="+ENV+"&secretPath="+encodeURIComponent(FOLDER);
  const exists=await jsonResponse(endpoint+query,{headers});
  if (exists.code===200) {
    status("OWNER_OPS_E579","EXISTS_UNCHANGED_NO_ROTATION");
    return;
  }
  if (exists.code!==404) halt("CHECK_EXISTING_SECRET_HTTP_"+exists.code);
  const first=randomBytes(48).toString("base64url");
  const created=await jsonResponse(endpoint,payload(headers,{
    projectId,environment:ENV,secretPath:FOLDER,secretValue:first,
    type:"shared", secretComment:"Staging-only GH2 / Infisical OIDC / TMN A2A bearer proof. No production calling authority."
  }));
  if (![200,201].includes(created.code)) halt("SECRET_CREATE_HTTP_"+created.code);
  if (created.data?.approval) {status("OWNER_OPS_E579","AWAITING_INFISICAL_APPROVAL");return;}
  if (!created.data?.secret) halt("SECRET_CREATE_NO_READBACK");
  const read1=await jsonResponse(endpoint+query,{headers});
  if(read1.code!==200 || !equal(read1.data?.secret?.secretValue||"",first)) halt("FIRST_SECRET_READBACK_FAILED");
  status("OWNER_OPS_E579","CREATED_AND_READBACK_VERIFIED");
  dockerDigest(first);
  status("DOCKER_REAL_CREDENTIAL_STDIN","PASS_NO_PLAINTEXT_LOG");
  // Rotate only the credential that this particular job just created.
  const second=randomBytes(48).toString("base64url");
  if(equal(first,second)) halt("ENTROPY_COLLISION");
  const rotated=await jsonResponse(endpoint,{
    method:"PATCH",headers:{"Content-Type":"application/json",...headers},
    body:JSON.stringify({projectId,environment:ENV,secretPath:FOLDER,secretValue:second})
  });
  if(![200,201].includes(rotated.code)) halt("ROTATE_NEW_SECRET_HTTP_"+rotated.code);
  if(rotated.data?.approval){status("OWNER_OPS_E579_ROTATION","AWAITING_APPROVAL");return;}
  const read2=await jsonResponse(endpoint+query,{headers});
  if(read2.code!==200 || !equal(read2.data?.secret?.secretValue||"",second) ||
     equal(read2.data?.secret?.secretValue||"",first)) halt("ROTATION_READBACK_FAILED");
  dockerDigest(second);
  status("OWNER_OPS_E579_ROTATION","PASS_FRESH_VALUE_DOCKER_SHA256");
  status("OWNER_OPS_E579_SCOPE","STAGING_ONLY_NO_EXTERNAL_API_AUTHORITY");
  // Neither secret value nor its hash is included in any log/artifact.
}
main().catch(e=>{
  if (e.message!=="STOP_REDACTED") {
    console.error("OWNER_OPS_E579_STOP=INTERNAL_FAILURE_REDACTED");
    process.exitCode=1;
  }
});
