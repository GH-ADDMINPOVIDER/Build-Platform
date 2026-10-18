#!/usr/bin/env python3
"""Resume OGE-128 after CLEANUP SUCCEEDED in prior Actions job.
No cleanup/delete command exists here. No certificate key, secret or PEM is read.
Modes: verify, finalize. Cloudflare sync handled by existing same-ID script.
"""
import json,os,pathlib,subprocess,urllib.request,glob
from copy import deepcopy
from datetime import datetime,timezone
import oge128_certificate_evidence_closure as cert

RUN_ID=39163934022
RUN_SHA="b1ff8f004d3023cbd54660dec4261abb3749e48e"
EXPECTED_STEP="Targeted cleanup guarded cryptographically for exactly two test-only filesets"
SOURCE_DRYRUN="39161934049"
RESULT_FILE="oge128-postcleanup-audit.txt"
STATUS="SCOPED_LOCAL_TEST_CLEANUP_VERIFIED_AUDIT_PARTIAL"
def verified_github_cleanup():
    data=cert.github_json("/actions/runs/"+str(RUN_ID))
    if data.get("head_sha")!=RUN_SHA or data.get("status")!="completed":
        raise RuntimeError("PREVIOUS_CLEANUP_PROVENANCE_INVALID")
    # Previous run failed later at audit publishing; cleanup step is independently SUCCESS.
    jobs=cert.github_json("/actions/runs/"+str(RUN_ID)+"/jobs?per_page=100").get("jobs",[])
    steps=[s for j in jobs for s in j.get("steps",[]) if s.get("name")==EXPECTED_STEP]
    if len(steps)!=1 or steps[0].get("conclusion")!="success":
        raise RuntimeError("PRIOR_CLEANUP_STEP_NOT_SUCCESS")
    return True
def remaining_temp_dirs():
    return len(glob.glob("/tmp/oge128-local-tls-*"))
def check():
    cert.guard()
    assert verified_github_cleanup(),"CLEANUP_PROVENANCE"
    remaining=remaining_temp_dirs()
    assert remaining==0,"RESIDUE_PRESENT_MUST_STOP"
    print("OGE128_PREVIOUS_CLEANUP_STEP=SUCCESS")
    print("OGE128_PREVIOUS_CLEANUP_RUN="+str(RUN_ID))
    print("OGE128_REMAINING_TEST_DIRECTORIES=0")
    print("OGE128_NO_DELETE_ACTION=TRUE")
def audit_summary():
    p=pathlib.Path(os.environ["RUNNER_TEMP"])/RESULT_FILE
    txt=p.read_text(encoding="utf-8")
    vals={}
    for line in txt.splitlines():
        if line.startswith("AUDIT_") and "=" in line:
            a,b=line.split("=",1)
            vals[a]=b.strip()
    assert vals.get("AUDIT_ASSESSMENT")=="NO_HIGH_CONFIDENCE_MATCH_BOUNDED_SCOPE","AUDIT_FINDING_BLOCK"
    assert vals.get("AUDIT_SIGNALS")=="0","SECRET_PATTERN_MATCHED"
    assert vals.get("AUDIT_INFISICAL_API")=="HTTP_200","INFISICAL_READ_UNAVAILABLE"
    return vals
def finalize():
    check()
    audit=audit_summary()
    doc=cert.get_doc()
    previous=deepcopy(doc)
    checkpoint=doc["consolidated_record"].get("security_evidence_checkpoint",{})
    if checkpoint.get("status")==STATUS and any(e.get("event")=="oge128_local_test_cleanup_verified" for e in doc["evidence_history_additions"]):
        print("OGE128_CERT_FINALIZE=ALREADY_PRESENT")
        return
    assert checkpoint.get("dry_run_receipt")=="github-actions:"+SOURCE_DRYRUN
    assert checkpoint.get("cleanup_status")=="PENDING"
    previous_events=doc["evidence_history_additions"]
    assert not any(e.get("event")=="oge128_local_test_cleanup_verified" for e in previous_events)
    actions_scanned=int(audit.get("AUDIT_GITHUB_LOGS_SCANNED","0"))
    evidence={
      "event":"oge128_local_test_cleanup_verified",
      "status":"SCOPED_LOCAL_TEST_CLEANUP_PASS_AUDIT_PARTIAL",
      "environment":"staging",
      "source_dry_run":"github-actions:"+SOURCE_DRYRUN,
      "cleanup_job_step_receipt":"github-actions:"+str(RUN_ID)+"/step/targeted-cleanup",
      "cleanup_source_commit":RUN_SHA,
      "independent_post_cleanup_host_residue_count":0,
      "deleted_test_directories":2,
      "deleted_test_private_key_files":2,
      "post_cleanup_bounded_audit_result":"NO_HIGH_CONFIDENCE_MATCH",
      "post_cleanup_actions_logs_scanned":actions_scanned,
      "post_cleanup_infisical_audit_api":"HTTP_200",
      "post_cleanup_audit_receipt_published":audit.get("AUDIT_RECEIPT_HTTP")=="201",
      "full_git_history_audited":False,
      "full_secret_exposure_assurance":False,
      "sensitive_values_written":False,
      "production_mutated":False,
      "infisical_leaf_mutated":False,
      "timestamp_utc":datetime.now(timezone.utc).isoformat(timespec="seconds")
    }
    previous_events.append(evidence)
    doc["consolidated_record"]["security_evidence_checkpoint"]={
      "status":STATUS,
      "dry_run_receipt":"github-actions:"+SOURCE_DRYRUN,
      "cleanup_receipt":"github-actions:"+str(RUN_ID),
      "cleanup_status":"PASS",
      "local_mtls_test_key_directories_remaining":0,
      "post_cleanup_scoped_pattern_matches":0,
      "post_cleanup_actions_logs_scanned":actions_scanned,
      "post_cleanup_infisical_audit_api":"HTTP_200",
      "post_cleanup_audit_receipt_published":evidence["post_cleanup_audit_receipt_published"],
      "full_historical_no_leak_guarantee":False,
      "certificate_owner_authorization_changed":False,
      "signed_capability_grant":False
    }
    cert.write_doc(previous,doc)
    print("OGE128_CERT_FINALIZE=PASS")
    print("OGE128_SECURITY_EVIDENCE_STATUS="+STATUS)
    print("OGE128_POST_AUDIT_ACTIONS_LOGS_SCANNED="+str(actions_scanned))
    print("OGE128_POST_AUDIT_RECEIPT_PUBLISHED="+str(evidence["post_cleanup_audit_receipt_published"]))
if __name__=="__main__":
    import sys
    if len(sys.argv)!=2 or sys.argv[1] not in ("verify","finalize"):
        raise SystemExit("EXPECTED_verify_OR_finalize")
    if sys.argv[1]=="verify":check()
    else:finalize()
