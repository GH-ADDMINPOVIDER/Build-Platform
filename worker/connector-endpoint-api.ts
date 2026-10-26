// OGE-131 — Full, source-backed Connector Endpoint inventory.
// Exactly 15 categories from OGE-130 Certificate lincenc evidence event #14.
// A category is NOT automatically a remote executable and a source proof is NOT E2E.
// Keep this inventory module dependency-free: its contract test evaluates the
// source in a sandbox without a module loader. These values mirror the shared
// self-host identity contract in worker/self-host-machine.ts.
const SELF_HOST_RUNNER_ID = "wave-runner-01" as const;
const SELF_HOST_MACHINE = {
  id: "SELF_HOST_MACHINE",
  display_name: "SELF HOST_MACHINE",
  physical_hostname: "OCIAN-S-Host",
} as const;
export type ConnectorModeKind = "TRANSPORT" | "IDENTITY" | "RUNNER_TOOL" | "AGENT_PROTOCOL" | "EXECUTION_CONTROL";
export type ConnectorMode = {
  id: string;
  kind: ConnectorModeKind;
  source: string;
  integration: string;
  safe_probe: string | null;
  execution_route: "WAVE_YELLOW_READ" | "WAVE_OWNER_SIGN" | "EXISTING_ADAPTER" | "NOT_ACTIVE_ADAPTER" | "NO_DIRECT_EXECUTION";
  runtime_e2e_proven: false;
};
const mode = (id: string, kind: ConnectorModeKind, source: string, integration: string, safe_probe: string | null,
  execution_route: ConnectorMode["execution_route"]): ConnectorMode => ({
    id,kind,source,integration,safe_probe,execution_route,runtime_e2e_proven:false
  });
export const connectorModes: ConnectorMode[] = [
  mode("mcp","TRANSPORT","worker/mcp-config-api.ts; PR #21","EXISTING_REMOTE_MCP_DISCOVERY","/api/mcp-config/discover?provider=<registered>", "EXISTING_ADAPTER"),
  mode("n8n","TRANSPORT","worker/connector-runtime.ts; OGE129 39185359617","EXISTING_N8N_API_HEALTH","/api/connector-endpoint/v1/probe?mode=n8n","EXISTING_ADAPTER"),
  mode("rest_api","TRANSPORT","worker/live-tools.ts; worker/connector-runtime.ts","EXISTING_HTTP_ADAPTER","/api/connector-endpoint/v1/status","WAVE_YELLOW_READ"),
  mode("token","IDENTITY","config/providers.json; worker/live-tools.ts","SERVER_SIDE_REFERENCE_ONLY",null,"NO_DIRECT_EXECUTION"),
  mode("secret","IDENTITY","Infisical OIDC; OGE128 39164763118","INFISICAL_SERVER_SIDE_ONLY",null,"NO_DIRECT_EXECUTION"),
  mode("credential","IDENTITY","provider_bindings; worker/mcp-config-api.ts","SECRET_REF_METADATA_ONLY",null,"NO_DIRECT_EXECUTION"),
  mode("repository_api_pr_api","TRANSPORT","worker/verified-function-tools.ts","GITHUB_READ_ONLY_PROVEN",null,"WAVE_YELLOW_READ"),
  mode("agent_api","AGENT_PROTOCOL","worker/connector-app-api.ts /api/chat/agent","EXISTING_AGENT_API; TERMINAL_RUN_OWNER_GATED",null,"WAVE_OWNER_SIGN"),
  mode("function_tool_calling","AGENT_PROTOCOL","worker/verified-function-tools.ts; worker/connector-app-api.ts","EXISTING_VERIFIED_READ_TOOLS; NO_GENERAL_BRIDGE",null,"EXISTING_ADAPTER"),
  mode("npx_cli","RUNNER_TOOL","package.json npx cap scripts","RUNNER_1_ALLOWLIST_ADAPTER_NOT_VERIFIED",null,"NOT_ACTIVE_ADAPTER"),
  mode("npm","RUNNER_TOOL","package.json; OGE130 39199805747","CI_BUILD_TOOL; NOT_REMOTE_RUNNER_EXECUTOR",null,"NO_DIRECT_EXECUTION"),
  mode("sdk","RUNNER_TOOL","ogenic-registry-mcp @modelcontextprotocol/sdk","SOURCE_DEPENDENCY; RUNNER_BRIDGE_NOT_VERIFIED",null,"NOT_ACTIVE_ADAPTER"),
  mode("a2a_agent_relay","AGENT_PROTOCOL","PR #22 worker/agent-relay-tools.ts","UNMERGED_CROSS_ACCOUNT_LIVE_UNVERIFIED",null,"NOT_ACTIVE_ADAPTER"),
  mode("webhook_event_calling","TRANSPORT","worker/connector-runtime.ts /hooks/generic","SIGNED_INBOUND_WEBHOOK_ONLY; NOT_OUTBOUND_EXECUTOR",null,"EXISTING_ADAPTER"),
  mode("agent_sign_command_run","EXECUTION_CONTROL","worker/entry-yellow-stone.ts; PR #42,#44","OWNER_SESSION_AND_PLAN_MATCH_REQUIRED",null,"WAVE_OWNER_SIGN"),
];
export const connectorModeCount = connectorModes.length;
const aliases: Record<string,string> = {
  api:"rest_api", rest:"rest_api", http:"rest_api",
  npx:"npx_cli", nxp:"npx_cli", cli:"npx_cli",
  pr_api:"repository_api_pr_api", repository_api:"repository_api_pr_api",
  agent:"agent_api", calling:"function_tool_calling", function_calling:"function_tool_calling", tool_calling:"function_tool_calling",
  a2a:"a2a_agent_relay", webhook:"webhook_event_calling",
  command:"agent_sign_command_run",
};
export function normalizeConnectorMode(input: unknown): string {
  if (typeof input !== "string" || input.length > 40) return "";
  const name=input.trim().toLowerCase().replace(/[\s-]+/g,"_");
  const normalized=aliases[name]??name;
  return connectorModes.some(item=>item.id===normalized)?normalized:"";
}
const safe = new Set(["transport","command","intent","capability","provider","mode","environment","input","approval"]);
const word=(value:unknown,max:number):string => typeof value==="string" && value.length<=max ? value.trim() : "";
const executable=new Set(["rest_api","repository_api_pr_api","agent_api","agent_sign_command_run"]);
const readonly=new Set(["rest_api","repository_api_pr_api"]);
const ownerRun=new Set(["agent_api","agent_sign_command_run"]);
export function normalizeConnectorEnvelope(raw:unknown) {
  if(!raw||typeof raw!=="object"||Array.isArray(raw))return {ok:false as const,code:"INVALID_ENVELOPE"};
  const body=raw as Record<string,unknown>;
  if(Object.keys(body).some(key=>!safe.has(key)))return {ok:false as const,code:"UNSUPPORTED_FIELD"};
  const transport=normalizeConnectorMode(body.transport);
  if(!transport)return {ok:false as const,code:"TRANSPORT_UNKNOWN"};
  if(["token","secret","credential"].includes(transport))
    return {ok:false as const,code:"IDENTITY_REFERENCE_ONLY_NO_SECRET_EXPORT"};
  if(!executable.has(transport))
    return {ok:false as const,code:"MODE_ADAPTER_NOT_VERIFIED_USE_EXISTING_SAFE_ROUTE"};
  if(body.environment!==undefined && body.environment!=="staging")
    return {ok:false as const,code:"ENVIRONMENT_SCOPE_MISMATCH"};
  const command=word(body.command??body.intent,1200);
  const capability=word(body.capability,160);
  const provider=word(body.provider,120);
  const selectedMode=word(body.mode,25);
  if(body.mode!==undefined && !["autonomous","read","execute","team"].includes(selectedMode))
    return {ok:false as const,code:"INVALID_WAVE_COMMAND_MODE"};
  const input=body.input===undefined?{}:body.input;
  if(!input||typeof input!=="object"||Array.isArray(input)||Object.keys(input).some(k=>k!=="path"&&k!=="prompt"))
    return {ok:false as const,code:"INVALID_COMMAND_INPUT"};
  const values=input as Record<string,unknown>;
  if((values.path!==undefined && (!word(values.path,500)||typeof values.path!=="string"))||
     (values.prompt!==undefined && (!word(values.prompt,6000)||typeof values.prompt!=="string")))
    return {ok:false as const,code:"INVALID_COMMAND_INPUT"};
  const approval=body.approval;
  if(approval!==undefined && (!approval||typeof approval!=="object"||Array.isArray(approval)||
    Object.keys(approval).some(k=>k!=="confirmed"&&k!=="approval_id")))
    return {ok:false as const,code:"INVALID_APPROVAL_ENVELOPE"};
  const approved=approval as {confirmed?:unknown;approval_id?:unknown}|undefined;
  if(approved && (approved.confirmed!==true || typeof approved.approval_id!=="string"||
    !/^wave-approval-[a-f0-9]{64}$/.test(approved.approval_id)))
    return {ok:false as const,code:"INVALID_OWNER_SIGNATURE"};
  // Strict transport-to-capability binding: spoofed mode names can never expand privilege.
  if(readonly.has(transport) && !(capability==="read_file"&&provider==="github"))
    return {ok:false as const,code:"MODE_CAPABILITY_NOT_ALLOWLISTED"};
  if(ownerRun.has(transport) && !(capability==="codex_selfhost"&&provider==="openai"))
    return {ok:false as const,code:"MODE_CAPABILITY_NOT_ALLOWLISTED"};
  if(!command&&!capability&&!provider)return {ok:false as const,code:"COMMAND_REQUIRED"};
  const delegated={
    command,capability,provider,mode:selectedMode||(readonly.has(transport)?"read":"autonomous"),
    environment:"staging",...(Object.keys(values).length?{input:values}:{ }),
    ...(approved?{approval:{confirmed:true,approval_id:approved.approval_id}}:{})
  };
  return {ok:true as const,transport,delegated};
}
export const connectorManifest={
  ok:true,version:"OGENIC_CONNECTOR_ENDPOINT_V2",environment:"staging",
  modes_documented:15,transports:connectorModes,
  mcp_config:"/api/mcp-config/state",
  mcp_discover:"/api/mcp-config/discover",
  n8n_safe_probe:"/api/connector-endpoint/v1/probe?mode=n8n",
  connector_status:"/api/connector-endpoint/v1/status",
  command:"/api/connector-endpoint/v1/command",
  canonical_command:"/api/wave/command",
  authorization:"YELLOW_STONE_ONLY",owner_sign:"PLAN_BOUND_OWNER_SESSION",
  registry_evidence:"oge130_connector_modes_repository_inventory_20261019",
  runner:SELF_HOST_RUNNER_ID,machine_id:SELF_HOST_MACHINE.id,machine_display_name:SELF_HOST_MACHINE.display_name,
  physical_hostname:SELF_HOST_MACHINE.physical_hostname,npx_worker_execution:false,credential_values_exposed:false,
  independently_executable:false,provider_adapters_require_live_proof:true,
  all_fifteen_modes_live_e2e_proven:false,
} as const;
