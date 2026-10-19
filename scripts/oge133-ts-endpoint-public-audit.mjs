// OGE-133 TS/GS public-stage endpoint audit: no credentials, mutations, or private response bodies.
// Evidence reports HTTP reachability and "requires auth" ONLY, never protected route execution.
import { writeFileSync } from "node:fs";
const checks = [
  ["wave_owner_session","https://wave.ogenicchocolate.com/api/session"],
  ["wave_connector_manifest","https://wave.ogenicchocolate.com/api/connector-endpoint/v1/manifest"],
  ["wave_connector_protocols","https://wave.ogenicchocolate.com/api/connector-endpoint/v1/protocols"],
  ["wave_connector_status","https://wave.ogenicchocolate.com/api/connector-endpoint/v1/status"],
  ["wave_athena_readiness","https://wave.ogenicchocolate.com/api/white-diamond/status"],
  ["n8n_selfhost_health","https://n8n-staging-76b7.up.railway.app/healthz"],
  ["n8n_registry_mcp","https://ogenic-registry.app.n8n.cloud/mcp-server/http"],
  ["github_consumer_default","https://api.github.com/repos/Ogenicchocolate21debug/Build-Platform/actions/workflows/wave-command-consumer.yml"],
];
const results=[];
for (const [id,url] of checks) {
  try {
    const r=await fetch(url,{method:"GET",redirect:"manual",
      headers:{"Accept":"application/json","User-Agent":"OGENIC-TS-ENDPOINT-READONLY-AUDIT"},
      signal:AbortSignal.timeout(9000)});
    // Protected endpoints should return 401. That is not proof the PR route is deployed.
    const reachable=r.status>0&&r.status<500;
    const status=r.status===401||r.status===403?"AUTH_REQUIRED":
      r.status===404?"NOT_REGISTERED_OR_NOT_DEPLOYED":
      r.status===405?"METHOD_REQUIRES_MCP_CLIENT":
      r.status>=300&&r.status<400?"REDIRECT_NOT_FOLLOWED":
      r.status>=500?"SERVER_ERROR":
      r.status>=200&&r.status<300?"HTTP_RESPONSE_ONLY":"OTHER";
    const record={id,http_status:r.status,status,network_reachable:reachable,
      authenticated_endpoint_proven:false,external_provider_execution_proven:false};
    results.push(record);
    console.log("OGE133_"+id+"="+r.status+" "+status);
    await r.body?.cancel().catch(()=>{});
  } catch {
    results.push({id,http_status:null,status:"NETWORK_UNVERIFIED",network_reachable:false,
      authenticated_endpoint_proven:false,external_provider_execution_proven:false});
    console.log("OGE133_"+id+"=NETWORK_UNVERIFIED");
  }
}
const proof={
  schema:"OGE133_TS_ENDPOINT_PUBLIC_READ_ONLY_V1",
  source_sha:process.env.GITHUB_SHA||"local",
  runner:process.env.RUNNER_NAME||"unknown",
  checked_at:new Date().toISOString(),
  transport:"HTTPS_GET_NO_CREDENTIALS",
  zero_mutations:true,secret_values_exposed:false,
  successful_http_not_equal_provider_e2e:true,
  results,
};
writeFileSync("oge133-ts-endpoint-public-proof.json",JSON.stringify(proof,null,2)+"\n");
console.log("OGE133_PUBLIC_PROOF_WRITTEN=TRUE");
