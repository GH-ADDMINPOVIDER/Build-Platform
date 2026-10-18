#!/usr/bin/env python3
"""Resume OGE-128 evidence after independently confirmed cleanup without re-deleting files."""
import json,os,sys,pathlib,glob,tempfile,urllib.request
from copy import deepcopy
REPO="Ogenicchocolate21debug/Build-Platform"
BRANCH="task/oge-128-runtime-certificate-20261018"
CERT=pathlib.Path(".ogenic/proofs/oge-128-wave-runner-01-certificate-baseline.json")
CERT_ID="oge-128-wave-runner-01-baseline-20261018"
OLD_RUN="39163934022"
TMP=pathlib.Path(os.environ["RUNNER_TEMP"])

def guard():
    assert os.environ["RUNNER_NAME"]=="wave-runner-01"
    assert os.environ["GITHUB_REPOSITORY"]==REPO
    assert os.environ["GITHUB_REF_NAME"]==BRANCH

def gh(path):
    req=urllib.request.Request("https://api.github.com/repos/"+REPO+path,
        headers={"Authorization":"Bearer "+os.environ["GH_TOKEN"],
                 "Accept":"application/vnd.github+json","User-Agent":"oge128-resume-evidence"})
    with urllib.request.urlopen(req,timeout=20) as resp:
        return json.load(resp)

def verify():
    guard()
    jobs=gh("/actions/runs/"+OLD_RUN+"/jobs?per_page=10")["jobs"]
    assert len(jobs)>=1
    steps={x["name"]:x["conclusion"] for x in jobs[0]["steps"]}
    assert steps["Sync SAME Certificate lincenc row to staging D1 and verify SHA readback"]=="success"
    assert steps["Targeted cleanup guarded cryptographically for exactly two test-only filesets"]=="success"
    residue=glob.glob(os.path.join(tempfile.gettempdir(),"oge128-local-tls-*"))
    assert residue==[], "LOCAL_RESIDUE_NOT_EMPTY"
    record={
      "status":"PASS",
      "original_cleanup_run_id":OLD_RUN,
      "verification_run_id":os.environ["GITHUB_RUN_ID"],
      "proven_by":"PRIOR_RUN_SUCCESSFUL_D1_AND_CLEANUP_STEPS_PLUS_CURRENT_ZERO_RESIDUE",
      "deleted_folders":2,"private_key_files_deleted":2,
      "remaining_folders":0,"unexpected_items":0,
      "leaf_private_key_accessed":False,"no_new_deletion":True
    }
    (TMP/"oge128-targeted-cleanup-result.json").write_text(json.dumps(record),encoding="utf-8")
    print("CERT_PRIOR_D1_SYNC=PASS")
    print("CERT_PRIOR_KEY_CLEANUP=PASS")
    print("CERT_NEW_DELETION=FALSE")
    print("CERT_LOCAL_TEST_RESIDUE_COUNT=0")
    print("CERT_RESUME_PROOF=PASS")

def finalize():
    guard()
    result=json.loads((TMP/"oge128-targeted-cleanup-result.json").read_text())
    assert result["status"]=="PASS" and result["remaining_folders"]==0
    assert result["original_cleanup_run_id"]==OLD_RUN and result["no_new_deletion"] is True
    audit=(TMP/"oge128-postcleanup-audit.txt").read_text()
    assert "AUDIT_ASSESSMENT=NO_HIGH_CONFIDENCE_MATCH_BOUNDED_SCOPE" in audit
    assert "AUDIT_SIGNALS=0" in audit
    lines={line.split("=",1)[0]:line.split("=",1)[1].strip()
           for line in audit.splitlines() if "=" in line and line.startswith("AUDIT_")}
    logs=int(lines.get("AUDIT_GITHUB_LOGS_SCANNED","0"))
    receipt=lines.get("AUDIT_RECEIPT_HTTP","UNAVAILABLE")
    doc=json.loads(CERT.read_text(encoding="utf-8"))
    before=deepcopy(doc)
    assert doc["certificate_id"]==CERT_ID
    assert doc["environment"]=="staging"
    assert doc["proof_policy"]["signed_capability_grant"] is False
    event="oge128_mtls_targeted_cleanup_and_scoped_postaudit"
    hist=doc["evidence_history_additions"]
    if not any(e.get("event")==event for e in hist):
        hist.append({
          "event":event,
          "status":"LOCAL_TEST_CLEANUP_PASS_POSTAUDIT_BOUNDED",
          "environment":"staging",
          "dry_run_proof":"github-actions:39161934049",
          "actual_cleanup_proof":"github-actions:"+OLD_RUN,
          "no_new_cleanup_performed":True,
          "resume_verification_run":os.environ["GITHUB_RUN_ID"],
          "test_directories_removed":2,
          "test_private_keys_removed":2,
          "remaining_test_directories":0,
          "post_cleanup_pattern_matches":0,
          "post_cleanup_actions_logs_scanned":logs,
          "post_cleanup_audit_comment_http":receipt,
          "full_historical_no_leak_assurance":False,
          "raw_keys_exported":False,
          "production_changed":False,
          "leaf_renewed":False})
    doc["consolidated_record"]["security_evidence_checkpoint"]={
      "status":"SCOPED_LOCAL_CLEANUP_PASS_AUDIT_LIMITED",
      "dry_run_proof":"github-actions:39161934049",
      "cleanup_proof":"github-actions:"+OLD_RUN,
      "verification_proof":"github-actions:"+os.environ["GITHUB_RUN_ID"],
      "cleanup_status":"PASS",
      "remaining_temp_test_directories":0,
      "scoped_postcleanup_scan":"NO_HIGH_CONFIDENCE_MATCH_BOUNDED_SCOPE",
      "github_logs_scanned_postcleanup":logs,
      "github_postcleanup_audit_receipt_http":receipt,
      "all_git_refs_or_global_runner_logs_covered":False,
      "absolute_no_leak_claim":False,
      "signed_capability_grant":False}
    for f in ("proof_policy","source_preservation","plugin_license_registry","certified_facts"):
        assert doc[f]==before[f],"PROTECTED_FIELD_MODIFIED"
    for f in ("authorization","cryptographic_leaf","runtime_subjects","constraints"):
        assert doc["consolidated_record"][f]==before["consolidated_record"][f]
    assert doc["evidence_history_additions"][:len(before["evidence_history_additions"])]==before["evidence_history_additions"]
    CERT.write_text(json.dumps(doc,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print("CERT_SCOPED_CLEANUP_EVIDENCE=PASS")
    print("CERT_POST_AUDIT_SOURCE_COVERAGE=LIMITED")
    print("CERT_POST_AUDIT_ACTIONS_LOGS_SCANNED="+str(logs))
    print("CERT_FULL_HISTORICAL_SECURITY_CERTIFIED=FALSE")

if __name__=="__main__":
    {"verify":verify,"finalize":finalize}[sys.argv[1]]()
