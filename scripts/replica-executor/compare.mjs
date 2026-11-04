// Compare a fixed, non-secret, non-mutating 10-route surface between
// ephemeral local workerd and the canonical staging URL. No owner auth,
// provider calls, remote D1 reads/writes, or secrets are used.
import { readFileSync, writeFileSync } from "node:fs";

const local = "http://127.0.0.1:8787";
const staging = "https://wave.ogenicchocolate.com";
const evidencePath = "replica-evidence.json";
const evidence = JSON.parse(readFileSync(evidencePath, "utf8"));
const cases = [
  ["web_root","GET","/","html",200],
  ["chat","GET","/chat","html",200],
  ["maop_ui","GET","/maop","html",200],
  ["overview_ui","GET","/overview","html",200],
  ["health","GET","/api/health","health",200],
  ["knowledge","GET","/api/knowledge-refinery/health","health",200],
  ["pageindex_auth","GET","/api/pageindex/status","auth",401],
  ["maop_auth","GET","/api/maop/lab/status","auth",401],
  ["yellow_resolve_auth","POST","/api/capabilities/resolve","auth",401],
  ["athena_command_auth","POST","/api/unifiend/command","auth",401],
];

async function probe(base, [id,method,path,kind,expected]) {
  const options = {method,signal:AbortSignal.timeout(7000)};
  if (method === "POST") {
    options.headers = {"Content-Type":"application/json"};
    options.body = JSON.stringify(id === "athena_command_auth"
      ? {intent:"read"}
      : {capability:"read_file",provider:"github",environment:"staging"});
  }
  try {
    const resp = await fetch(base+path,options);
    const contentType = resp.headers.get("content-type") || "";
    const body = await resp.text();
    let contract = false;
    if (kind === "html") contract = contentType.includes("html") && body.includes('id="root"');
    if (kind === "health") {
      const j = JSON.parse(body);
      contract = contentType.includes("json") && (j.ok === true || j.status === "ok" || j.status === "healthy");
    }
    if (kind === "auth") {
      const j = JSON.parse(body);
      contract = contentType.includes("json") && j.ok === false && j.code === "REAUTH_REQUIRED";
    }
    return {status:resp.status,contract,expected,code: resp.status === expected && contract ? "MATCH_EXPECTED_CONTRACT" : "MISMATCH"};
  } catch (error) {
    return {status:null,contract:false,expected,code:"REQUEST_UNAVAILABLE"};
  }
}

const comparisons = [];
for (const spec of cases) {
  const [l,s] = await Promise.all([probe(local,spec),probe(staging,spec)]);
  const pass = l.status === spec[4] && s.status === spec[4] && l.contract && s.contract;
  comparisons.push({test:spec[0],path:spec[2],method:spec[1],expected:spec[4],
    local_status:l.status,staging_status:s.status,
    local_contract:l.contract,staging_contract:s.contract,match:pass});
}
const passed = comparisons.filter(x=>x.match).length;
const available = comparisons.every(x=>x.staging_status !== null);
const ratio = available ? passed / comparisons.length : null;
evidence.staging_comparison = {
  scope:"TEN_PUBLIC_OR_UNAUTHENTICATED_ROUTE_CONTRACTS_ONLY",
  source_staging_url:staging,
  tests_total:comparisons.length,
  tests_matched:passed,
  surface_match_ratio:ratio,
  target_surface_match_ratio:0.9,
  reached_target:ratio !== null && ratio >= 0.9,
  status:ratio === null?"STAGING_UNREACHABLE":ratio >= 0.9?"SURFACE_TARGET_MET":"SURFACE_TARGET_NOT_MET",
  // A 10/10 route match is not full app-state/edge/secret equivalence.
  certified_full_runtime_parity:false,
  notes:"No authenticated business flow, remote D1 contents, external agent or real deploy tested.",
  cases:comparisons
};
writeFileSync(evidencePath,JSON.stringify(evidence,null,2)+"\n");
console.log(JSON.stringify({
  comparison:evidence.staging_comparison.status,
  matched:passed+"/"+comparisons.length,
  surface_ratio:ratio,
  certified_full_runtime_parity:false,
  evidence:evidencePath
}));
