#!/usr/bin/env python3
"""Append OGE-130 repo-wide connector/mode inventory to SAME Certificate lincenc.
Source-based inventory is not a universal live-adapter attestation. No keys or tokens.
"""
import os,sys
from copy import deepcopy
from datetime import datetime,timezone
import oge128_certificate_evidence_closure as cert

EVENT="oge130_connector_modes_repository_inventory_20261019"
STAGING="phase-vi-provider-incentive-metering"
FEATURE="feature/wave-liquid-glass-command-ux-20261018"
RELAY="feature/oge-agent-relay-collision-lab"
REGISTRY="Ogenicchocolate21debug/ogenic-registry-mcp@main"

def row(mode,source,proof,execution):
    return {"mode":mode,"source":source,"evidence_class":proof,"execution_verification":execution}

MODES=[
 row("MCP","Build-Platform@"+STAGING+":worker/mcp-config-api.ts; PR #21; "+REGISTRY+":app/mcp/route.ts",
     "IMPLEMENTED_SOURCE_AND_MCP_CONTRACT_TEST","PROVIDER_BINDING_TOOL_CALL_E2E_NOT_UNIVERSALLY_VERIFIED"),
 row("n8n","Build-Platform@"+STAGING+":worker/connector-runtime.ts; OGE-129 GitHub Actions 39185359617",
     "HEALTH_AND_CONNECTOR_READINESS_RUNTIME_PASS","ARBITRARY_WORKFLOW_RUN_RESULT_E2E_NOT_VERIFIED"),
 row("REST_API","Build-Platform@"+STAGING+":worker/live-tools.ts; worker/connector-runtime.ts",
     "IMPLEMENTED_SOURCE_AND_BOUNDED_READ_PROOFS","PER_PROVIDER_EXECUTION_NOT_UNIVERSALLY_VERIFIED"),
 row("TOKEN","Build-Platform@"+STAGING+":config/providers.json; worker/live-tools.ts",
     "SERVER_SIDE_AUTH_REFERENCE_CODE","PER_PROVIDER_SCOPE_AND_ACCEPTANCE_NOT_UNIVERSALLY_VERIFIED"),
 row("SECRET","Build-Platform@"+STAGING+":scripts/infisical-discover-project.sh; GitHub Actions 39164763118",
     "INFISICAL_OIDC_AND_STAGING_D1_SYNC_RUNTIME_PASS","FULL_SECRET_INVENTORY_OR_SCOPE_AUDIT_NOT_VERIFIED"),
 row("CREDENTIAL","Build-Platform@"+STAGING+":worker/mcp-config-api.ts; Owner Session + provider_bindings",
     "OWNER_AUTH_AND_REFERENCE_ONLY_BINDINGS_IMPLEMENTED","ALL_PROVIDER_CREDENTIAL_ACTIVATION_NOT_VERIFIED"),
 row("REPOSITORY_API_PR_API","Build-Platform@"+STAGING+":worker/verified-function-tools.ts",
     "GITHUB_READ_ADAPTER_IMPLEMENTED_AND_READ_RUNTIME_PASS","ACTIONS_CONSUMER_EXECUTION_AND_PR_WRITE_NOT_E2E_VERIFIED"),
 row("AGENT_API","Build-Platform@"+STAGING+":worker/connector-app-api.ts /api/chat/agent",
     "AGENT_API_ROUTE_IMPLEMENTED","ALL_AGENTS_RUN_E2E_NOT_VERIFIED"),
 row("FUNCTION_TOOL_CALLING","Build-Platform@"+STAGING+":worker/verified-function-tools.ts; worker/connector-app-api.ts /api/chat/functions",
     "SEVEN_VERIFIED_READ_TOOLS_SOURCE_AND_TOOL_LOOP_IMPLEMENTED","ALL_MODELS_OR_PROVIDER_CALLS_NOT_E2E_VERIFIED"),
 row("NPX_NPX_CLI","Build-Platform@"+STAGING+":package.json app:ios:add/sync/open npx cap; @"+FEATURE+":worker/connector-endpoint-api.ts",
     "PROJECT_NPX_SCRIPTS_PRESENT","CONNECTOR_NPX_RUNNER_ADAPTER_NOT_VERIFIED"),
 row("NPM","Build-Platform@"+STAGING+":package.json; OGE-130 Actions 39199805747",
     "NPM_TEST_TYPECHECK_BUILD_WORKFLOW_PASS","REPRODUCIBLE_LOCKFILE_ABSENT_ON_OGE130_BRANCH"),
 row("SDK",""+REGISTRY+":package.json @modelcontextprotocol/sdk 1.30.0",
     "MCP_SDK_DECLARED_IN_PACKAGE_DEPENDENCIES","WAVE_GENERIC_SDK_RUNNER_ADAPTER_NOT_VERIFIED"),
 row("A2A_AGENT_RELAY","Build-Platform@"+RELAY+":worker/agent-relay-tools.ts; PR #22; Actions 38386700150",
     "MCP_RELAY_SEND_LIST_ACK_THREAD_SOURCE_AND_CONTRACT_TEST_PASS","GS_GT_CROSS_ACCOUNT_LIVE_RELAY_NOT_VERIFIED"),
 row("WEBHOOK_EVENT_CALLING","Build-Platform@"+STAGING+":worker/connector-runtime.ts /hooks/generic",
     "SIGNED_HMAC_AND_DEDUP_HANDLER_SOURCE","ALL_LIVE_PROVIDER_WEBHOOK_DELIVERY_NOT_VERIFIED"),
 row("AGENT_SIGN_COMMAND_RUN","Build-Platform@"+FEATURE+":worker/entry-yellow-stone.ts /api/wave/command; PR #42; PR #44",
     "READ_OWNER_APPROVAL_ID_AND_FORGED_SIGN_REJECTION_RUNTIME_PASS","OWNER_CONFIRMED_AGENT_RUNNER_D1_COMMAND_RESULT_E2E_NOT_VERIFIED"),
]
def main():
    if len(sys.argv)!=2 or sys.argv[1]!="append":raise SystemExit("EXPECTED_append")
    cert.guard()
    doc=cert.get_doc()
    prior=deepcopy(doc)
    prev=[x for x in doc["evidence_history_additions"] if x.get("event")==EVENT]
    if prev:
        assert len(prev)==1 and prev[0]["modes_documented"]==15,"EVIDENCE_CONFLICT"
        print("OGE130_CONNECTOR_INVENTORY_APPEND=ALREADY_PRESENT")
        return
    # Cross-repo source path references are evidence pointers, not current live proof.
    entry={
       "event":EVENT,
       "status":"REPOSITORY_INVENTORY_VERIFIED_RUNTIME_PARTIAL",
       "environment":"staging",
       "scope":"WAVE Connector Endpoint / Calling / Agent Sign Command Run inventory across repository branches",
       "modes_documented":len(MODES),
       "mode_records":MODES,
       "evidence":[
          "github-actions:39199805747:oge130_source_tests_typecheck_build_success",
          "github-actions:38386700150:agent_relay_contract_test_success",
          "github-actions:39186105154:agent_sign_read_and_approval_denial_verified",
          "github-actions:39164763118:certificate_previous_d1_sha_readback_pass",
          "github:Ogenicchocolate21debug/Build-Platform/pull/21",
          "github:Ogenicchocolate21debug/Build-Platform/pull/22",
          "github:Ogenicchocolate21debug/Build-Platform/pull/42",
          "github:Ogenicchocolate21debug/Build-Platform/pull/44",
          "github:Ogenicchocolate21debug/ogenic-registry-mcp/main"
       ],
       "source_branch_staging":STAGING,
       "source_branch_connector":FEATURE,
       "source_branch_agent_relay":RELAY,
       "raw_secret_or_credential_values_included":False,
       "owner_approval_bypassed":False,
       "signed_capability_grant_changed":False,
       "provider_write_execution_performed":False,
       "connector_endpoint_deployed_by_this_evidence":False,
       "a2a_cross_account_e2e_verified":False,
       "agent_sign_run_e2e_verified":False,
       "production_mutated":False,
       "timestamp_utc":datetime.now(timezone.utc).isoformat(timespec="seconds")
    }
    assert len(MODES)==15
    assert all(m["mode"] and m["source"] and m["execution_verification"] for m in MODES)
    doc["evidence_history_additions"].append(entry)
    cert.write_doc(prior,doc)
    check=cert.get_doc()
    assert len(check["evidence_history_additions"])==len(prior["evidence_history_additions"])+1
    assert check["evidence_history_additions"][-1]["event"]==EVENT
    assert check["source_preservation"]==prior["source_preservation"]
    assert check["consolidated_record"]["security_evidence_checkpoint"]==prior["consolidated_record"]["security_evidence_checkpoint"]
    print("OGE130_CONNECTOR_INVENTORY_APPEND=PASS")
    print("OGE130_CONNECTOR_MODES_RECORDED=15")
    print("OGE130_PREVIOUS_EVIDENCE_EVENTS_PRESERVED="+str(len(prior["evidence_history_additions"])))
    print("OGE130_SIGNED_CAPABILITY_GRANT=FALSE")
    print("OGE130_FULL_E2E_PROVEN=FALSE")
if __name__=="__main__":main()
