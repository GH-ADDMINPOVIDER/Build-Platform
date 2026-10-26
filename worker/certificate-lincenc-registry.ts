import type { ConnectorD1 } from "./connector-runtime";

// Owner evidence reader: one original OGE-128 record, stored in existing staging D1.
// Do not expose document_json: a safe projection is produced by an explicit allowlist.
export const CERTIFICATE_ID = "oge-128-wave-runner-01-baseline-20261018";
const SOURCE_BRANCH = "task/oge-128-runtime-certificate-20261018";
const SOURCE_PATH = ".ogenic/proofs/oge-128-wave-runner-01-certificate-baseline.json";
const DB_NAME = "ogenic-phase-vi-staging";
type CertRow = {
  certificate_id: string; display_name: string; environment: string;
  document_sha256: string; document_json: string; plugin_groups: number;
  verified_connections: number; source_commit: string;
};
type Dict = Record<string, unknown>;
const asDict = (v: unknown): Dict => v && typeof v === "object" && !Array.isArray(v) ? v as Dict : {};
const limited = (v: unknown, n=120): string => typeof v === "string" ? v.slice(0,n) : "";
function failure(code:string, status:number) {
  return { ok:false as const, code, http_status:status, read_only:true, runtime_e2e_verified:false };
}

export async function readCertificateLincenc(db: ConnectorD1 | undefined) {
  if (!db) return failure("D1_BINDING_UNAVAILABLE",503);
  let row: CertRow | null;
  try {
    row = await db.prepare("SELECT certificate_id, display_name, environment, document_sha256, document_json, plugin_groups, verified_connections, source_commit FROM certificate_lincenc WHERE certificate_id = ? LIMIT 1").bind(CERTIFICATE_ID).first<CertRow>();
  } catch {
    return failure("CERTIFICATE_D1_READ_UNAVAILABLE",503);
  }
  if (!row) return failure("CERTIFICATE_RECORD_NOT_FOUND",404);
  if (row.certificate_id !== CERTIFICATE_ID || row.display_name !== "Certificate lincenc" || row.environment !== "staging" || !/^[a-f0-9]{64}$/.test(row.document_sha256)) {
    return failure("CERTIFICATE_METADATA_MISMATCH",409);
  }
  try {
    const bytes = new TextEncoder().encode(row.document_json);
    const hash = await crypto.subtle.digest("SHA-256",bytes);
    const digest = Array.from(new Uint8Array(hash)).map(x=>x.toString(16).padStart(2,"0")).join("");
    if (digest !== row.document_sha256) return failure("CERTIFICATE_INTEGRITY_MISMATCH",409);
    const doc = asDict(JSON.parse(row.document_json));
    const registry = asDict(doc.plugin_license_registry);
    const corrected = asDict(doc.owner_identity_correction_20261020);
    const roles = asDict(corrected.account_roles);
    const gh1 = asDict(roles.github_1), gh2 = asDict(roles.github_2);
    const ts = asDict(roles.codex_ts), gs = asDict(roles.codex_gs);
    if (doc.certificate_id !== CERTIFICATE_ID || registry.display_name !== "Certificate lincenc" || !Array.isArray(registry.entries)) {
      return failure("CERTIFICATE_DOCUMENT_IDENTITY_MISMATCH",409);
    }
    const entries = (registry.entries as unknown[]).slice(0,80).map(value=>{
      const e=asDict(value);
      return { plugin:limited(e.plugin,90), status:limited(e.status,80), current_runtime_e2e:"NOT_PROVEN_BY_CERTIFICATE" };
    });
    const historicalVerified = entries.filter(x=>x.status==="VERIFIED_CONNECTED_READ_API").length;
    if (entries.length !== Number(row.plugin_groups) || historicalVerified !== Number(row.verified_connections)) {
      return failure("CERTIFICATE_REGISTRY_COUNT_MISMATCH",409);
    }
    return {
      ok:true as const, read_only:true,
      record_kind:"OWNER_AUTHORIZATION_EVIDENCE_REGISTRY_NOT_TLS_CERTIFICATE",
      display_name:"Certificate lincenc", certificate_id:CERTIFICATE_ID,
      environment:"staging", canonical_session:"owner-main / 1LSS_OWNER_MAIN",
      seven_stones_separate:true, integrity:"D1_DOCUMENT_SHA256_MATCH",
      document_sha256:row.document_sha256,
      source_commit:limited(row.source_commit,80),
      canonical_source:{
        repository:"Wave-Runner-2/Build-Platform",branch:SOURCE_BRANCH,path:SOURCE_PATH,
        url:"https://github.com/Wave-Runner-2/Build-Platform/blob/"+SOURCE_BRANCH+"/"+SOURCE_PATH,
      },
      storage:{provider:"Cloudflare",database:DB_NAME,table:"certificate_lincenc",source:"LIVE_D1_READ",duplicate_certificate:false},
      plugins:{total:entries.length,historical_verified_read_api:historicalVerified,entries,current_execution_scope_unverified:true},
      owner_identity_labels:{
        github_first:{label:limited(gh1.owner_label),role:limited(gh1.runtime_role),github_login:limited(gh1.connected_github_login),repo_permission_at_evidence_time:limited(gh1.repo_permission_verified),owner_scope_note:limited(gh1.oauth_or_connector_scope_completeness)},
        github_second:{label:limited(gh2.owner_label),role:limited(gh2.runtime_role),github_login:limited(gh2.connected_github_login),repo_permission_at_evidence_time:limited(gh2.repo_permission_verified),owner_scope_note:limited(gh2.oauth_or_connector_scope_owner_setting),oauth_scope_live_verified:false},
        codex_gs:{identity:limited(gs.canonical_identity),profile:limited(gs.runtime_profile),current_execution_verified:false},
        codex_ts:{identity:limited(ts.canonical_identity),profile:limited(ts.historical_original_profile),historical_execution_proof:limited(ts.historical_execution_proof),historical_execution_result:limited(ts.historical_result),current_execution_verified:false},
      },
      identity_migration_20261026:{
        status:"PENDING_EXTERNAL_VERIFICATION",
        github_first:{email:"tawatchaisamornrum11@gmail.com",github_login:"Ogenicchocolate21debug",github_id:306097555,display_label:"STORE ONLY",machine_reference:"STORE_ONLY",dispatch_eligible:false},
        github_second:{email:"tomload21@gmail.com",github_login:"Wave-Runner-2",github_id:342175560,display_label:"GH_ADDMINPROVIDER",machine_reference:"GH_ADDMINPROVIDER",requested_role:"Admin",observed_repository_permission:"write",admin_verified:false,actions_write_verified:false},
        infisical_live_readback:false,
        d1_write_performed:false,
      },
      license_scope:"EVIDENCE_ONLY_NOT_PROVIDER_ENTITLEMENT",x509_leaf_issued:false,
      command_execution_authorized_by_this_document:false,
      github_dispatch_actions_write_proven_by_this_document:false,
      runtime_e2e_verified:false,
    };
  } catch {
    return failure("CERTIFICATE_DOCUMENT_UNREADABLE",409);
  }
}
