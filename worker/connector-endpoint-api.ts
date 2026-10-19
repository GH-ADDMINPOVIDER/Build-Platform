// OGE-131: Reuse the single WAVE Connector Endpoint. Never execute a provider or shell here.
// Inventory is a source/contract catalogue, not a blanket claim of active integrations.
export const connectorModes = [
  {id:"mcp",via:"mcp-config",ready:"CHECK_REGISTERED_BINDING"},
  {id:"n8n",via:"connector-runtime",ready:"CHECK_PROVIDER_RUNTIME"},
  {id:"api",via:"capability-resolver",ready:"CHECK_PROVIDER"},
  {id:"token",via:"infisical",ready:"REFERENCE_ONLY"},
  {id:"secret",via:"infisical",ready:"REFERENCE_ONLY"},
  {id:"credential",via:"infisical",ready:"REFERENCE_ONLY"},
  {id:"pr_api",via:"github",ready:"READ_API_VERIFIED_WRITE_REQUIRES_APPROVAL"},
  {id:"agent_api",via:"athena-yellow",ready:"ADMISSION_VERIFIED_ONLY"},
  {id:"function_calling",via:"verified-function-tools",ready:"SEVEN_READ_TOOLS_ONLY"},
  {id:"npx",via:"runner-1",ready:"NOT_INSTALLED_OR_VERIFIED"},
  {id:"npm",via:"runner-1",ready:"DEPENDENCY_BUILD_PROOF_ONLY"},
  {id:"sdk",via:"runner-1",ready:"NOT_INSTALLED_OR_VERIFIED"},
  {id:"a2a",via:"agent-relay",ready:"LIVE_CROSS_ACCOUNT_NOT_VERIFIED"},
  {id:"webhook",via:"connector-runtime",ready:"SIGNED_INGRESS_ONLY"},
  {id:"agent_sign_run",via:"athena-yellow",ready:"OWNER_SIGN_RUN_E2E_PENDING"},
] as const;

export const connectorAliases: Record<string, typeof connectorModes[number]["id"]> = {
  rest_api:"api", repository_api:"pr_api", repository_pr_api:"pr_api",
  tool_calling:"function_calling", function_tool_calling:"function_calling",
  npx_cli:"npx", npx_npx_cli:"npx", a2a_agent_relay:"a2a",
  agent_relay:"a2a", webhook_event:"webhook", webhook_event_calling:"webhook",
  agent_sign_command_run:"agent_sign_run",
};
const channels = new Set<string>(connectorModes.map((x) => x.id));
const safe = new Set(["transport","command","intent","capability","provider","mode","environment","input","approval"]);
const word = (v:unknown,max:number) => typeof v==="string" && v.length<=max ? v.trim() : "";

export function normalizeConnectorEnvelope(raw:unknown) {
  if(!raw || typeof raw!=="object" || Array.isArray(raw))return {ok:false as const,code:"INVALID_ENVELOPE"};
  const b=raw as Record<string,unknown>;
  if(Object.keys(b).some((k)=>!safe.has(k)))return {ok:false as const,code:"UNSUPPORTED_FIELD"};
  const requested=word(b.transport,45).toLowerCase();
  const transport=connectorAliases[requested] || requested;
  if(!channels.has(transport))return {ok:false as const,code:"TRANSPORT_UNKNOWN"};
  if(["credential","token","secret"].includes(transport))return {ok:false as const,code:"CREDENTIAL_REFERENCE_ONLY"};
  if(["npx","npm","sdk"].includes(transport))return {ok:false as const,code:"RUNNER_ADAPTER_NOT_VERIFIED"};
  if(transport==="webhook")return {ok:false as const,code:"WEBHOOK_SIGNED_INGRESS_ONLY"};
  if(transport==="a2a")return {ok:false as const,code:"AGENT_RELAY_RUNTIME_NOT_VERIFIED"};
  const environment=word(b.environment??"staging",40);
  if(environment!=="staging")return {ok:false as const,code:"ENVIRONMENT_SCOPE_MISMATCH"};
  const input=b.input;
  if(input!==undefined && (!input || typeof input!=="object" || Array.isArray(input) ||
    Object.entries(input).some(([key,value])=>!["path","prompt"].includes(key) ||
      typeof value!=="string" || value.length>(key==="path"?500:6000))))
    return {ok:false as const,code:"INPUT_NOT_ALLOWED"};
  const approval=b.approval;
  if(approval!==undefined && (!approval || typeof approval!=="object" || Array.isArray(approval) ||
    Object.entries(approval).some(([key,value])=>!["confirmed","approval_id"].includes(key) ||
      (key==="confirmed"?typeof value!=="boolean":typeof value!=="string" || value.length>220))))
    return {ok:false as const,code:"APPROVAL_NOT_ALLOWED"};
  if(["command","intent","capability","provider","mode"].some((key)=>b[key]!==undefined &&
    (typeof b[key]!=="string" || (b[key] as string).length>(key==="command"||key==="intent"?1200:key==="capability"?160:key==="provider"?120:25))))
    return {ok:false as const,code:"INPUT_NOT_ALLOWED"};
  const delegated={
    command:word(b.command??b.intent,1200),
    capability:word(b.capability,160),
    provider:word(b.provider,120),
    mode:word(b.mode,25)||"autonomous",
    environment:"staging",
    ...(input!==undefined?{input}:{}),
    ...(approval!==undefined?{approval}:{}),
  };
  if(!delegated.command&&!delegated.capability&&!delegated.provider)return {ok:false as const,code:"COMMAND_REQUIRED"};
  // Existing normalizeWaveCommandBody plus ATHENA/Yellow Stone still validate
  // the entire delegated request and independently revalidate Owner confirmation.
  return {ok:true as const,transport,delegated};
}

export const connectorManifest={
  ok:true,version:"OGENIC_CONNECTOR_ENDPOINT_V2",environment:"staging",
  transports:connectorModes,
  aliases:connectorAliases,
  mcp_config:"/api/mcp-config/state",
  mcp_discover_existing:"/api/mcp-config/discover",
  mcp_discover:"/api/connector-endpoint/v1/mcp/discover",
  connector_status:"/api/connector-endpoint/v1/status",
  functions:"/api/connector-endpoint/v1/functions",
  function_invoke:"/api/connector-endpoint/v1/invoke",
  connector_test:"/api/connector-endpoint/v1/test",
  events:"/api/connector-endpoint/v1/events",
  command:"/api/connector-endpoint/v1/command",
  canonical_command:"/api/wave/command",
  authorization:"YELLOW_STONE_ONLY",owner_sign:"PLAN_BOUND_OWNER_SESSION",
  npx_worker_execution:false,credential_values_exposed:false,
  independently_executable:false,provider_adapters_require_live_proof:true,
  enabled_operations:["manifest","status","functions","invoke_read_only","test","events","mcp_discover","command_owner_gated"],
  verified_function_execution:"SEVEN_EXISTING_READ_TOOLS_ONLY",
  live_e2e_proven:false,security_audit:"PARTIAL",
} as const;
