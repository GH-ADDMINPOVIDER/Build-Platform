#!/usr/bin/env python3
"""OGE-128 scoped exposure audit. Only aggregated findings may be published."""
import os, re, io, glob, json, zipfile, collections, subprocess, datetime, urllib.parse, urllib.request, urllib.error
REPO="Ogenicchocolate21debug/Build-Platform"
TOKEN=os.getenv("GITHUB_TOKEN","")
RUNS=[39157854800,39157241923,39154203875,39154097349]
PATS={
 "PEM_PRIVATE_KEY":rb"-----BEGIN (?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----\s*[A-Za-z0-9+/=\r\n]{80,}-----END (?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----",
 "GITHUB_TOKEN":rb"\b(?:gh[pousr]_[A-Za-z0-9_]{36,}|github_pat_[A-Za-z0-9_]{40,})\b",
 "OPENAI_KEY":rb"\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{40,}\b",
 "AWS_ACCESS_ID":rb"\b(?:AKIA|ASIA)[A-Z0-9]{16}\b",
 "JWT":rb"\beyJ[A-Za-z0-9_-]{30,}\.eyJ[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{16,}\b",
}
PATS={name:re.compile(pattern,re.I) for name,pattern in PATS.items()}
FOUND=collections.Counter()
REPORT={
 "scope":"OGE128_STAGING_RUNNER1_BOUNDED",
 "source_sha":os.getenv("GITHUB_SHA"),
 "audit_run":os.getenv("GITHUB_RUN_ID"),
 "timestamp_utc":datetime.datetime.now(datetime.timezone.utc).isoformat(),
 "secret_values_in_report":False,"github":{},"runner":{},"infisical":{},"limitations":[]
}
def scan(b,where):
 for name,pat in PATS.items():
  FOUND[(where,name)]+=len(pat.findall(b))
class NoRedirect(urllib.request.HTTPRedirectHandler):
 def redirect_request(self,request,fp,code,msg,headers,newurl):return None
def github(path,limit=2000000,raw=False):
 if not TOKEN:raise RuntimeError("GITHUB_TOKEN_MISSING")
 req=urllib.request.Request("https://api.github.com/repos/"+REPO+path,headers={
  "Authorization":"Bearer "+TOKEN,"Accept":"application/vnd.github+json","User-Agent":"oge128-audit"})
 try:content=urllib.request.build_opener(NoRedirect()).open(req,timeout=16).read(limit+1)
 except urllib.error.HTTPError as e:
  if e.code not in (301,302,303,307,308):raise RuntimeError("GH_HTTP_"+str(e.code)) from None
  url=e.headers.get("Location","");p=urllib.parse.urlparse(url)
  trusted=p.hostname and (p.hostname.endswith(".blob.core.windows.net") or p.hostname.endswith(".actions.githubusercontent.com"))
  if p.scheme!="https" or not trusted:raise RuntimeError("UNTRUSTED_REDIRECT")
  with urllib.request.urlopen(urllib.request.Request(url,headers={"User-Agent":"oge128-audit"}),timeout=16) as f:content=f.read(limit+1)
 if len(content)>limit:raise RuntimeError("RESOURCE_EXCEEDS_CAP")
 return content if raw else json.loads(content)
def actions():
 result={"runs":RUNS,"run_metadata":0,"logs_scanned":0,"log_errors":0,"artifacts_scanned":0,"artifact_errors":0,"artifacts_skipped":0}
 for rid in RUNS:
  try:
   jobs=github("/actions/runs/%d/jobs?per_page=20"%rid)["jobs"];result["run_metadata"]+=1
   for job in jobs[:10]:
    try:scan(github("/actions/jobs/%d/logs"%job["id"],1500000,True),"ACTIONS_LOG");result["logs_scanned"]+=1
    except Exception:result["log_errors"]+=1
  except Exception:result["log_errors"]+=1
  try:
   artifacts=github("/actions/runs/%d/artifacts?per_page=20"%rid)["artifacts"]
   for art in artifacts[:4]:
    if art.get("expired") or int(art.get("size_in_bytes") or 0)>8000000:
     result["artifacts_skipped"]+=1;continue
    try:
     zipdata=github("/actions/artifacts/%d/zip"%art["id"],8000000,True)
     with zipfile.ZipFile(io.BytesIO(zipdata)) as z:
      for m in z.infolist()[:40]:
       if m.is_dir() or m.file_size>512000 or m.filename.lower().endswith((".png",".jpg",".pdf",".gif",".zip",".exe",".mp4")):continue
       with z.open(m) as f:scan(f.read(512001),"ACTIONS_ARTIFACT")
     result["artifacts_scanned"]+=1
    except Exception:result["artifact_errors"]+=1
  except Exception:result["artifact_errors"]+=1
 REPORT["github"]["actions"]=result
 if result["log_errors"] or result["artifact_errors"]:REPORT["limitations"].append("ACTIONS_LOG_OR_ARTIFACT_PARTIAL")
def gitcmd(*args):
 p=subprocess.run(["git",*args],capture_output=True,timeout=15)
 if p.returncode:raise RuntimeError("GIT_COMMAND_FAILED")
 return p.stdout
def history():
 d={"scope":"CHECKED_OUT_REF_REACHABLE_BLOBS","max_objects":6000,"max_blob_bytes":512000,"scanned":0,"skipped_large":0,"capped":False}
 try:
  refs=gitcmd("rev-list","--objects","HEAD").splitlines();d["capped"]=len(refs)>6000
  for line in refs[:6000]:
   sha=line.split(b" ",1)[0].decode("ascii","ignore")
   if not re.fullmatch("[0-9a-f]{40,64}",sha):continue
   try:
    if gitcmd("cat-file","-t",sha).strip()!=b"blob":continue
    size=int(gitcmd("cat-file","-s",sha).strip())
    if size>512000:d["skipped_large"]+=1;continue
    scan(gitcmd("cat-file","blob",sha),"GIT_BLOB");d["scanned"]+=1
   except Exception:continue
  d["status"]="BOUNDED"
 except Exception:d["status"]="UNAVAILABLE"
 REPORT["github"]["history"]=d
 REPORT["limitations"].append("GIT_NOT_ALL_REFS_OR_UNREACHABLE_DELETED_OBJECTS")
def runner():
 import stat, time
 paths=set()
 for pat in ("/tmp/oge128-local-tls-*","/tmp/oge128-*.key","/tmp/oge128-*.pem"):
  paths.update(glob.glob(pat))
 details={"directories":0,"regular_files":0,"symlinks":0,"other":0,"group_or_world_readable":0,"group_or_world_writable":0,"older_than_1h":0,"owned_by_runner":0}
 for p in paths:
  try:
   info=os.lstat(p);mode=info.st_mode
   category="directories" if stat.S_ISDIR(mode) else "regular_files" if stat.S_ISREG(mode) else "symlinks" if stat.S_ISLNK(mode) else "other"
   details[category]+=1
   details["group_or_world_readable"]+=bool(mode & 0o044)
   details["group_or_world_writable"]+=bool(mode & 0o022)
   details["older_than_1h"]+=time.time()-info.st_mtime>3600
   details["owned_by_runner"]+=info.st_uid==os.getuid()
  except Exception:pass
 nested={"total_entries":0,"regular_files":0,"private_key_named_files":0,"world_or_group_readable_files":0,"symlinks":0}
 for root in sorted(paths):
  if not os.path.isdir(root) or os.path.islink(root):continue
  try:
   entries=list(os.scandir(root))[:40]
   for e in entries:
    try:
     meta=e.stat(follow_symlinks=False)
     nested["total_entries"]+=1
     nested["regular_files"]+=stat.S_ISREG(meta.st_mode)
     nested["symlinks"]+=stat.S_ISLNK(meta.st_mode)
     nested["world_or_group_readable_files"]+=bool(meta.st_mode & 0o044)
     nested["private_key_named_files"]+=bool(re.search(r"(\\.key$|private.*\\.pem$|server\\.key$)",e.name,re.I))
    except Exception:pass
  except Exception:pass
 REPORT["runner"]={"host":os.getenv("RUNNER_NAME"),"oge128_temp_residue_count":len(paths),
  "temp_metadata_no_pathnames":details,"nested_temp_metadata_no_pathnames":nested,"contents_read":False,
  "system_journal":"NOT_SCANNED","other_user_files":"NOT_SCANNED"}
 REPORT["limitations"].append("RUNNER_GLOBAL_JOURNAL_AND_BACKUPS_UNSCANNED")
def infreq(path,token="",body=None):
 headers={"Content-Type":"application/json","User-Agent":"oge128-audit"}
 if token:headers["Authorization"]="Bearer "+token
 req=urllib.request.Request("https://app.infisical.com"+path,
  data=json.dumps(body).encode() if body is not None else None,
  headers=headers)
 try:
  with urllib.request.urlopen(req,timeout=16) as res:return res.status,json.loads(res.read(1500000))
 except urllib.error.HTTPError as e:return e.code,{}
 except Exception:return "NETWORK_ERROR",{}
def infisical():
 d={"oidc":"NOT_ATTEMPTED","audit_api":"NOT_ATTEMPTED","entries_scanned":0,"coverage":"NONE"}
 try:
  req=urllib.request.Request(os.environ["ACTIONS_ID_TOKEN_REQUEST_URL"],headers={
   "Authorization":"Bearer "+os.environ["ACTIONS_ID_TOKEN_REQUEST_TOKEN"]})
  with urllib.request.urlopen(req,timeout=12) as resp:jwt=json.load(resp)["value"]
  code,login=infreq("/api/v1/auth/oidc-auth/login",body={"identityId":os.environ["INFISICAL_IDENTITY_ID"],
   "organizationSlug":os.environ["INFISICAL_ORG_SLUG"],"jwt":jwt})
  if code!=200 or not login.get("accessToken"):d["oidc"]="HTTP_"+str(code);return
  d["oidc"]="PASS";token=login["accessToken"]
  code,projects=infreq("/api/v1/projects",token)
  project=next((p for p in projects.get("projects",[]) if p.get("slug")=="cert-manager-89-qe"),None)
  if code!=200 or not project:d["audit_api"]="PROJECT_NOT_VISIBLE";return
  query=urllib.parse.urlencode({"projectId":project["id"],"limit":100,"offset":0})
  code,logs=infreq("/api/v1/organization/audit-logs?"+query,token)
  d["audit_api"]="HTTP_"+str(code)
  if code!=200:d["coverage"]="UNAVAILABLE_PERMISSION_OR_PLAN";return
  entries=logs.get("auditLogs",[])
  d["entries_scanned"]=len(entries) if isinstance(entries,list) else 0
  d["identity_secret_pki_event_count"]=sum(1 for e in entries if any(s in str((e.get("event") or {}).get("type","")).lower() for s in ("secret","identity","certificate","pki","login")))
  d["coverage"]="FIRST_100_EVENTS_ONLY"
 except Exception:d["coverage"]="UNAVAILABLE"
 finally:
  REPORT["infisical"]=d
  REPORT["limitations"].append("INFISICAL_AUDIT_PAGINATION_OR_UNAVAILABLE")
def publish():
 findings={a+"_"+b:n for (a,b),n in sorted(FOUND.items()) if n}
 REPORT["findings"]={"high_confidence_patterns":findings,"signals":sum(findings.values())}
 REPORT["conclusion"]="POTENTIAL_EXPOSURE_TRIAGE_REQUIRED" if findings else "NO_HIGH_CONFIDENCE_MATCH_BOUNDED_SCOPE"
 REPORT["absolute_no_leak_claim"]=False
 body="OGE-128 SECURITY EXPOSURE AUDIT — SCOPED READ-ONLY\n\n"+json.dumps(REPORT,indent=2,sort_keys=True)+"\n\nNo raw values, secrets, or snippets included. A bounded audit cannot prove that no historical leakage ever occurred."
 req=urllib.request.Request("https://api.github.com/repos/"+REPO+"/issues/39/comments",
  method="POST",data=json.dumps({"body":body}).encode(),headers={
  "Authorization":"Bearer "+TOKEN,"Content-Type":"application/json",
  "Accept":"application/vnd.github+json","User-Agent":"oge128-audit"})
 try:
  with urllib.request.urlopen(req,timeout=15) as res:print("AUDIT_RECEIPT_HTTP="+str(res.status))
 except Exception:print("AUDIT_RECEIPT_HTTP=UNAVAILABLE")
 print("AUDIT_ASSESSMENT="+REPORT["conclusion"])
 print("AUDIT_SIGNALS="+str(sum(findings.values())))
 print("AUDIT_GITHUB_LOGS_SCANNED="+str(REPORT["github"].get("actions",{}).get("logs_scanned",0)))
 print("AUDIT_GIT_BLOBS_SCANNED="+str(REPORT["github"].get("history",{}).get("scanned",0)))
 print("AUDIT_INFISICAL_API="+str(REPORT["infisical"].get("audit_api","UNAVAILABLE")))
if __name__=="__main__":
 if os.getenv("RUNNER_NAME")!="wave-runner-01":raise SystemExit("HOST_GUARD_DENIED")
 for fn in (actions,history,runner,infisical):
  try:fn()
  except Exception:REPORT["limitations"].append("SEGMENT_FAILED_"+fn.__name__)
 publish()
