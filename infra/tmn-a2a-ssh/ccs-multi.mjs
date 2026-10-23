// CCS/1.0 (OGENIC_USE_CARD_V1 / MA-OP) multi-protocol envelope: contract inspection ONLY.
// Original Infisical key names are retained as brokered references, never resolved here.
import { readFileSync } from "node:fs";
import { connectorModes, normalizeConnectorMode } from "../../worker/connector-endpoint-api.ts";
import { brokeredCredentialReference } from "../../worker/ccs-authority.ts";

export const manifest = JSON.parse(readFileSync(new URL("./ccs-multi-manifest.json", import.meta.url),"utf8"));
const EXPECTED = 15;
const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj,key);
const object = x => x && typeof x === "object" && !Array.isArray(x);
const cardFields = new Set(["mode","card_id","holder","capability","stone_code","state","scope","credential_ref","lease"]);
const batchFields = new Set(["protocol","wrapper","mode","environment","cards","secret_values_present"]);
const badFields = /^(?:secret|token|credential|api[_-]?key|password|private[_-]?key|authorization|auth_header|bearer|raw[_-]?(?:value|token|secret)|secretValue|tokenValue|payload_value)$/i;

function containsRawValue(data, depth = 0) {
  if(depth > 7) return true;
  if(Array.isArray(data)) return data.some(x=>containsRawValue(x,depth+1));
  if(!object(data)) return false;
  return Object.entries(data).some(([k,v]) => badFields.test(k) && k !== "credential_ref" ||
    containsRawValue(v,depth+1));
}
function fail(code) { return {ok:false,code}; }

export function validateCcsMulti(batch) {
  if (!object(batch) || containsRawValue(batch)) return fail("CCS_RAW_CREDENTIAL_OR_INVALID_ENVELOPE");
  if (Object.keys(batch).some(k=>!batchFields.has(k))) return fail("CCS_UNSUPPORTED_BATCH_FIELD");
  if(batch.protocol !== "CCS/1.0" || batch.wrapper !== "MA-OP" ||
    batch.mode !== "MULTI" || batch.environment !== "staging" ||
    batch.secret_values_present !== false) return fail("CCS_STAGING_PROTOCOL_SCOPE_REQUIRED");
  if (!Array.isArray(batch.cards) || batch.cards.length !== EXPECTED) return fail("CCS_EXACT_15_MODE_CARDS_REQUIRED");
  if(manifest.schema_version !== "CCS/1.0" || manifest.facade_for !== "OGENIC_USE_CARD_V1" ||
     manifest.wrapper !== "MA-OP" || manifest.stone_code !== "YS-01" ||
     manifest.modes.length !== EXPECTED || connectorModes.length !== EXPECTED) return fail("CCS_SOURCE_REGISTRY_DRIFT");
  const source = new Map(connectorModes.map(x=>[x.id,x]));
  const declared = new Map(manifest.modes.map(x=>[x.id,x]));
  if(source.size !== EXPECTED || declared.size !== EXPECTED) return fail("CCS_REGISTRY_DUPLICATE");
  if([...source.keys()].some(id=>!declared.has(id))) return fail("CCS_SOURCE_REGISTRY_DRIFT");
  const seen = new Set();
  const rows=[];
  for (const card of batch.cards) {
    if(!object(card) || Object.keys(card).some(k=>!cardFields.has(k)) ||
      !object(card.scope) || Object.keys(card.scope).some(k=>!["permission","environment"].includes(k))) {
      return fail("CCS_INVALID_CARD_FIELDS");
    }
    const id = normalizeConnectorMode(card.mode);
    if (id !== card.mode || !source.has(id) || seen.has(id)) return fail("CCS_UNKNOWN_OR_DUPLICATE_MODE");
    seen.add(id);
    if (card.card_id !== "ccs.staging."+id || card.holder !== "GH_ADDMIN_POVIDER" ||
      card.capability !== "connector.protocol.inspect" || card.stone_code !== "YS-01" ||
      card.state !== "INSERTED" || card.lease !== false ||
      card.scope.permission !== "READ" || card.scope.environment !== "staging") {
      return fail("CCS_OWNER_SCOPE_OR_CARD_STATE_MISMATCH");
    }
    const registered = declared.get(id);
    if(card.credential_ref !== registered.credential_ref) return fail("CCS_CREDENTIAL_NAME_REF_MISMATCH");
    if(card.credential_ref !== null && !brokeredCredentialReference(card.credential_ref)) {
      return fail("CCS_CREDENTIAL_REF_NOT_BROKERED");
    }
    rows.push({
      mode:id,kind:source.get(id).kind,probe:"CONTRACT_PASS",
      provider_invoked:false,secret_value_exported:false,
      credential_name_preserved:registered.credential_name !== null,
      credential_runtime_verified:false
    });
  }
  return seen.size === EXPECTED ? {
    ok:true,code:"CCS_MULTI_15_CONTRACT_VALID",protocol:"CCS/1.0",
    facade:"OGENIC_USE_CARD_V1",wrapper:"MA-OP",category_count:EXPECTED,
    contract_tested:EXPECTED, credential_bytes_exported:0,
    yellow_owner_execution_authorized:false,provider_execution_performed:false,
    runtime_e2e_verified:false,cards:rows
  } : fail("CCS_MODE_SET_INCOMPLETE");
}

export function buildCcsMultiProbe() {
  return {
    protocol:"CCS/1.0",wrapper:"MA-OP",mode:"MULTI",environment:"staging",
    secret_values_present:false,
    cards:manifest.modes.map(x=>({
      mode:x.id,card_id:"ccs.staging."+x.id,holder:"GH_ADDMIN_POVIDER",
      capability:"connector.protocol.inspect",stone_code:"YS-01",
      state:"INSERTED",scope:{permission:"READ",environment:"staging"},
      credential_ref:x.credential_ref,lease:false
    }))
  };
}
