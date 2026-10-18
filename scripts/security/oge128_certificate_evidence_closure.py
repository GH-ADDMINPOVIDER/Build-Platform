#!/usr/bin/env python3
"""OGE-128 existing Certificate lincenc lifecycle: evidence append and staging D1 readback.
Never print document_json, API credentials, private keys or PEM.
"""
import hashlib, json, os, pathlib, sys, urllib.request, urllib.error
from copy import deepcopy

ROOT=pathlib.Path(".ogenic/proofs")
CERT=ROOT/"oge-128-wave-runner-01-certificate-baseline.json"
AMEND=ROOT/"oge-128-mtls-dry-run-certificate-amendment-20261019.json"
CERT_ID="oge-128-wave-runner-01-baseline-20261018"
DB_ID="b4ac3a33-df80-47cf-8e75-7574e025b87b"
DB_NAME="ogenic-phase-vi-staging"
TABLE="certificate_lincenc"
GH_REPO="Ogenicchocolate21debug/Build-Platform"
BRANCH="task/oge-128-runtime-certificate-20261018"

def guard():
    assert os.getenv("RUNNER_NAME")=="wave-runner-01", "RUNNER_SCOPE"
    assert os.getenv("GITHUB_REPOSITORY")==GH_REPO, "REPOSITORY_SCOPE"
    assert os.getenv("GITHUB_REF_NAME")==BRANCH, "BRANCH_SCOPE"

def github_json(path):
    token=os.environ["GH_TOKEN"]
    req=urllib.request.Request("https://api.github.com/repos/"+GH_REPO+path,
        headers={"Authorization":"Bearer "+token, "Accept":"application/vnd.github+json",
                 "User-Agent":"oge128-cert-evidence-closure"})
    with urllib.request.urlopen(req,timeout=20) as r:
        return json.load(r)

def get_doc():
    doc=json.loads(CERT.read_text(encoding="utf-8"))
    assert doc["certificate_id"]==CERT_ID and doc["environment"]=="staging"
    assert doc["proof_policy"]["signed_capability_grant"] is False
    assert doc["consolidated_record"]["authorization"]["signed_capability_grant"] is False
    reg=doc["plugin_license_registry"]
    assert reg["slug"]==TABLE and reg["logical_separation"]=="INDEPENDENT_OF_SEVEN_STONES"
    assert all(e["credential_values_included"] is False for e in reg["entries"])
    return doc

def write_doc(old,new):
    assert old["certificate_id"]==new["certificate_id"]==CERT_ID
    for path in ("proof_policy","source_preservation","plugin_license_registry","certified_facts"):
        assert new[path]==old[path], "PROTECTED_FIELD_CHANGED_"+path
    for path in ("authorization","cryptographic_leaf","runtime_subjects","constraints"):
        assert new["consolidated_record"][path]==old["consolidated_record"][path], "PROTECTED_CONSOLIDATED_"+path
    older=old["evidence_history_additions"]
    assert new["evidence_history_additions"][:len(older)]==older, "NOT_APPEND_ONLY"
    CERT.write_text(json.dumps(new,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")

def prepare():
    guard()
    amendment=json.loads(AMEND.read_text(encoding="utf-8"))
    assert amendment["certificate_id"]==CERT_ID
    proof=amendment["proof"]
    assert proof["github_actions_run_id"]=="39161934049"
    assert proof["inspected_folders"]==2 and proof["ephemeral_key_pairs_confirmed"]==2
    assert proof["blocked"]==0 and proof["unexpected_items"]==0
    assert proof["cleanup_performed"] is False and proof["secrets_exported"] is False
    run=github_json("/actions/runs/39161934049")
    assert run["status"]=="completed" and run["conclusion"]=="success", "DRY_RUN_NOT_PASS"
    assert run["head_sha"]==proof["github_actions_sha"], "DRY_RUN_SHA_MISMATCH"
    comment=github_json("/issues/comments/6254559747").get("body","")
    for term in ("status=TEST_KEYS_CONFIRMED","folders=2","eligible=2","blocked=0",
                 "key_pair_matches=2","self_signed_localhost=2","cleanup_performed=false",
                 "leaf_private_key_accessed=false"):
        assert term in comment, "EVIDENCE_RECEIPT_MISMATCH"
    doc=get_doc();old=deepcopy(doc)
    event="oge128_mtls_temp_key_dry_run"
    if not any(e.get("event")==event and e.get("proof")=="github-actions:39161934049" for e in doc["evidence_history_additions"]):
        doc["evidence_history_additions"].append({
          "event":event,
          "status":"TEST_KEYS_CONFIRMED_CLEANUP_PENDING",
          "environment":"staging",
          "scope":"Runner-1 ephemeral localhost mTLS test-server certificates",
          "proof":"github-actions:39161934049",
          "amendment_file":str(AMEND),
          "source_sha":proof["github_actions_sha"],
          "key_pairs_verified":2,
          "blocked":0,"no_raw_credentials":True,
          "cleanup_status":"PENDING",
          "full_security_certification":False})
        doc["consolidated_record"]["security_evidence_checkpoint"]={
          "status":"DRY_RUN_VERIFIED_CLEANUP_PENDING",
          "dry_run_receipt":"github-actions:39161934049",
          "scoped_audit_receipt":"github-actions:39161269166",
          "confirmed_test_key_pairs":2,
          "cleanup_status":"PENDING","post_cleanup_audit":"NOT_RUN",
          "historical_no_leak_guarantee":False,
          "signed_capability_grant":False}
        write_doc(old,doc)
        print("CERT_EVIDENCE_APPEND=PASS")
    else:print("CERT_EVIDENCE_APPEND=ALREADY_PRESENT")

def finalize():
    guard()
    doc=get_doc();old=deepcopy(doc)
    tmp=pathlib.Path(os.environ["RUNNER_TEMP"])
    receipt=json.loads((tmp/"oge128-targeted-cleanup-result.json").read_text())
    assert receipt["status"]=="PASS" and receipt["deleted_folders"]==2
    assert receipt["remaining_folders"]==0 and receipt["private_key_files_deleted"]==2
    assert receipt["unexpected_items"]==0
    audit=(tmp/"oge128-postcleanup-audit.txt").read_text()
    assert "AUDIT_ASSESSMENT=NO_HIGH_CONFIDENCE_MATCH_BOUNDED_SCOPE" in audit
    assert "AUDIT_SIGNALS=0" in audit
    assert "AUDIT_RECEIPT_HTTP=201" in audit
    assert doc["consolidated_record"]["security_evidence_checkpoint"]["status"]=="DRY_RUN_VERIFIED_CLEANUP_PENDING"
    event="oge128_mtls_targeted_cleanup_and_scoped_postaudit"
    if not any(e.get("event")==event for e in doc["evidence_history_additions"]):
        doc["evidence_history_additions"].append({
          "event":event,"status":"LOCAL_TEST_KEY_CLEANUP_VERIFIED",
          "environment":"staging","source_dry_run":"github-actions:39161934049",
          "cleanup_run_id":os.environ["GITHUB_RUN_ID"],
          "deleted_test_directories":2,"deleted_test_private_key_files":2,
          "remaining_test_directories":0,
          "post_cleanup_scoped_audit":"NO_HIGH_CONFIDENCE_MATCH_BOUNDED_SCOPE",
          "full_history_scanned":False,"raw_credentials_included":False,
          "production_mutated":False,"infisical_leaf_mutated":False})
        doc["consolidated_record"]["security_evidence_checkpoint"]={
          "status":"SCOPED_LOCAL_TEST_CLEANUP_AND_POSTAUDIT_PASS",
          "dry_run_receipt":"github-actions:39161934049",
          "cleanup_receipt":"github-actions:"+os.environ["GITHUB_RUN_ID"],
          "cleanup_status":"PASS",
          "remaining_local_test_key_directories":0,
          "scoped_audit_result":"NO_HIGH_CONFIDENCE_MATCH_BOUNDED_SCOPE",
          "full_history_or_all_cloud_sources_certified":False,
          "historical_no_leak_guarantee":False,
          "signed_capability_grant":False}
        write_doc(old,doc)
        print("CERT_LOCAL_CLEANUP_EVIDENCE_APPEND=PASS")
    else:print("CERT_LOCAL_CLEANUP_EVIDENCE_APPEND=ALREADY_PRESENT")

def cloudflare_request(path,body=None):
    account=os.environ.get("CLOUDFLARE_ACCOUNT_ID")
    token=os.environ.get("CLOUDFLARE_API_TOKEN")
    if not account or not token:raise RuntimeError("CLOUDFLARE_STAGING_AUTH_NOT_AVAILABLE")
    url="https://api.cloudflare.com/client/v4/accounts/"+account+"/d1/database/"+DB_ID+path
    data=json.dumps(body).encode() if body is not None else None
    req=urllib.request.Request(url,data=data,method="POST" if data is not None else "GET",
      headers={"Authorization":"Bearer "+token,"Content-Type":"application/json","Accept":"application/json",
               "User-Agent":"oge128-d1-sync"})
    try:
        with urllib.request.urlopen(req,timeout=28) as response:result=json.load(response)
    except urllib.error.HTTPError as ex:raise RuntimeError("D1_HTTP_"+str(ex.code)) from None
    if result.get("success") is not True:raise RuntimeError("D1_RESPONSE_NOT_SUCCESS")
    return result

def query(sql,params=[]):
    result=cloudflare_request("/query",{"sql":sql,"params":[str(p) for p in params]})["result"]
    if not isinstance(result,list) or len(result)!=1 or result[0].get("success") is not True:
        raise RuntimeError("D1_QUERY_FAILED")
    return result[0].get("results") or []

def sync():
    guard()
    cfg=json.loads(pathlib.Path("wrangler.jsonc").read_text(encoding="utf-8"))
    assert cfg["name"]==DB_NAME and any(x.get("database_id")==DB_ID and x.get("database_name")==DB_NAME for x in cfg["d1_databases"])
    doc=get_doc()
    raw=CERT.read_bytes()
    sha=hashlib.sha256(raw).hexdigest()
    meta=cloudflare_request("").get("result") or {}
    assert meta.get("name")==DB_NAME, "D1_DATABASE_MISMATCH"
    rows=query("SELECT certificate_id, environment, document_sha256, document_json FROM certificate_lincenc WHERE certificate_id=?", [CERT_ID])
    assert len(rows)==1 and rows[0]["environment"]=="staging", "D1_RECORD_ID_MISSING_OR_CONFLICT"
    previous=json.loads(rows[0]["document_json"])
    assert previous["certificate_id"]==doc["certificate_id"]==CERT_ID
    assert previous["plugin_license_registry"]==doc["plugin_license_registry"], "D1_REGISTRY_MISMATCH"
    old_history=previous["evidence_history_additions"]
    latest_history=doc["evidence_history_additions"]
    # Must not remove any historical evidence already present in D1.
    assert len(latest_history)>=len(old_history) and latest_history[:len(old_history)]==old_history, "D1_PROOF_HISTORY_WOULD_ROLL_BACK"
    if rows[0]["document_sha256"]!=sha:
        query("UPDATE certificate_lincenc SET document_sha256=?,document_json=?,source_commit=?,updated_at=CURRENT_TIMESTAMP WHERE certificate_id=? AND environment='staging'",
          [sha,raw.decode("utf-8"),os.environ["GITHUB_SHA"],CERT_ID])
    readback=query("SELECT certificate_id,environment,document_sha256,document_json FROM certificate_lincenc WHERE certificate_id=?", [CERT_ID])
    assert len(readback)==1 and readback[0]["document_sha256"]==sha
    assert hashlib.sha256(readback[0]["document_json"].encode()).hexdigest()==sha
    assert json.loads(readback[0]["document_json"])==doc
    print("CERTIFICATE_LINCENC_D1_WRITE=PASS")
    print("CERTIFICATE_LINCENC_D1_READBACK=PASS")
    print("CERTIFICATE_LINCENC_SHA256="+sha)
    print("CERTIFICATE_LINCENC_EVIDENCE_EVENTS="+str(len(latest_history)))
    print("CERTIFICATE_LINCENC_OTHER_TABLES_MUTATED=FALSE")

def main():
    mode=sys.argv[1]
    if mode=="prepare":prepare()
    elif mode=="finalize":finalize()
    elif mode=="sync":sync()
    else:raise ValueError("UNKNOWN_MODE")
if __name__=="__main__":main()
