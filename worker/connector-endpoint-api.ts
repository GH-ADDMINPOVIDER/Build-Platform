// OGE-130: Unified Connector Endpoint. This module never executes a connector.
export const connectorModes = [
  {id:"mcp",via:"mcp-config",ready:"CHECK_REGISTERED_BINDING"},
  {id:"npx",via:"runner-1",ready:"NOT_INSTALLED_OR_VERIFIED"},
  {id:"api",via:"capability-resolver",ready:"CHECK_PROVIDER"},
  {id:"sdk",via:"runner-1",ready:"NOT_INSTALLED_OR_VERIFIED"},
  {id:"pr_api",via:"github",ready:"CHECK_ACTIONS_SCOPE"},
  {id:"agent_api",via:"athena-yellow",ready:"ADMISSION_VERIFIED_ONLY"},
  {id:"credential",via:"infisical",ready:"REFERENCE_ONLY"},
] as const;
const channels = new Set(connectorModes.map(x=>x.id));
const safe = new Set(["transport","command","intent","capability","provider","mode","environment","input","approval"]);
const word = (v:unknown,max:number) => typeof v==="string" && v.length<=max ? v.trim() : "";
export function normalizeConnectorEnvelope(raw:unknown) {
  if(!raw || typeof raw!=="object" || Array.isArray(raw))return {ok:false as const,code:"INVALID_ENVELOPE"};
  const b=raw as Record<string,unknown>;
  if(Object.keys(b).some(k=>!safe.has(k)))return {ok:false as const,code:"UNSUPPORTED_FIELD"};
  const transport=word(b.transport,30).toLowerCase();
  if(!channels.has(transport as typeof connectorModes[number]["id"]))return {ok:false as const,code:"TRANSPORT_UNKNOWN"};
  if(transport==="credential")return {ok:false as const,code:"CREDENTIAL_REFERENCE_ONLY"};
  if(transport==="npx"||transport==="sdk")return {ok:false as const,code:"RUNNER_ADAPTER_NOT_VERIFIED"};
  const environment=word(b.environment??"staging",40);
  if(environment!=="staging")return {ok:false as const,code:"ENVIRONMENT_SCOPE_MISMATCH"};
  const input=b.input;
  if(input!==undefined && (!input || typeof input!=="object" || Array.isArray(input) ||
      Object.keys(input).some(k=>k!=="path" && k!=="prompt")))return {ok:false as const,code:"INPUT_NOT_ALLOWED"};
  const original=b.approval;
  if(original!==undefined && (!original || typeof original!=="object" || Array.isArray(original) ||
      Object.keys(original).some(k=>k!=="confirmed" && k!=="approval_id")))return {ok:false as const,code:"APPROVAL_NOT_ALLOWED"};
  const delegated={
    command:word(b.command??b.intent,1200),
    capability:word(b.capability,160),
    provider:word(b.provider,120),
    mode:word(b.mode,25)||"autonomous",
    environment:"staging",
    ...(input!==undefined?{input}:{}),
    ...(original!==undefined?{approval:original}:{}),
  };
  if(!delegated.command&&!delegated.capability&&!delegated.provider)return {ok:false as const,code:"COMMAND_REQUIRED"};
  return {ok:true as const,transport,delegated};
}
export const connectorManifest={
  ok:true,version:"OGENIC_CONNECTOR_ENDPOINT_V1",environment:"staging",
  transports:connectorModes,
  mcp_config:"/api/mcp-config/state",
  mcp_discover:"/api/mcp-config/discover",
  connector_status:"/api/connectors",
  command:"/api/connector-endpoint/v1/command",
  canonical_command:"/api/wave/command",
  authorization:"YELLOW_STONE_ONLY",owner_sign:"PLAN_BOUND_OWNER_SESSION",
  npx_worker_execution:false,credential_values_exposed:false,
  independently_executable:false,provider_adapters_require_live_proof:true
} as const;
