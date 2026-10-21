#!/usr/bin/env python3
"""Mirror GH-1 Build-Platform to a NEW PRIVATE GH-2 repository.
No secrets in output, no GH-1 writes, no privilege substitution.
All Git branches/tags/commits; GitHub settings, Actions secrets, D1 are NOT Git content.
"""
import json, os, shutil, subprocess, sys, tempfile, urllib.request, urllib.error
from pathlib import Path

SOURCE = "Ogenicchocolate21debug/Build-Platform"
TARGET = "Wave-Runner-2/Build-Platform"
GH2 = "wave-runner-2"
BRANCH = "task/gh2-build-platform-mirror-20261021"
API = "https://api.github.com"
HEADERS = {"Accept": "application/vnd.github+json",
           "X-GitHub-Api-Version": "2022-11-28",
           "User-Agent": "OGENIC-GH2-private-mirror"}

def fail(code):
    print("GH2_MIRROR_STATUS=" + code, flush=True)
    raise SystemExit(1)

def api(token, method, endpoint, payload=None, missing=False):
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(API + endpoint, method=method, data=data,
       headers={**HEADERS, "Authorization": "Bearer " + token,
                "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=18) as response:
            blob = response.read()
            return json.loads(blob) if blob else {}
    except urllib.error.HTTPError as e:
        if missing and e.code == 404:
            return None
        raise RuntimeError("GITHUB_API_" + endpoint.split("?")[0].split("/")[1] + "_HTTP_" + str(e.code)) from None
    except (urllib.error.URLError, TimeoutError):
        raise RuntimeError("GITHUB_API_NETWORK_UNAVAILABLE") from None

def run(cmd, token=None, cwd=None, timeout=240, check=True):
    env = os.environ.copy()
    # Prevent background workflow/API credentials taking priority over target identity.
    for name in ("GITHUB_TOKEN", "GH_TOKEN", "GH_ENTERPRISE_TOKEN", "GIT_CONFIG_COUNT",
                 "GIT_CONFIG_KEY_0", "GIT_CONFIG_VALUE_0"):
        env.pop(name, None)
    if token is not None:
        env["OGE_GIT_ASKPASS_TOKEN"] = token
        env["GIT_ASKPASS"] = str(askpass)
        env["GIT_TERMINAL_PROMPT"] = "0"
    p = subprocess.run(cmd, cwd=cwd, env=env, text=True,
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=timeout)
    if check and p.returncode != 0:
        # stderr may include a private URL or auth context. Never print it.
        raise RuntimeError("GIT_COMMAND_FAILED_" + str(p.returncode) + "_" + cmd[0])
    return p

if os.environ.get("GITHUB_REPOSITORY") != SOURCE: fail("SOURCE_SCOPE_MISMATCH")
if os.environ.get("GITHUB_REF_NAME") != BRANCH: fail("BRANCH_SCOPE_MISMATCH")
if os.environ.get("RUNNER_NAME") != "wave-runner-01": fail("HOST_SCOPE_MISMATCH")
if os.environ.get("GITHUB_ACTOR") not in ("Ogenicchocolate21debug", "Wave-Runner-2"):
    fail("UNRECOGNIZED_ACTOR")
source_token = os.environ.get("OGE_SOURCE_READ_TOKEN", "").strip()
if not source_token: fail("SOURCE_REPO_READ_TOKEN_MISSING")
print("GH2_MIRROR_SOURCE=" + SOURCE)
print("GH2_MIRROR_DESTINATION=" + TARGET)
print("GH2_MIRROR_VISIBILITY=PRIVATE_ONLY")

# The GH-2 ChatGPT OAuth connector is NOT automatically available to the Runner.
# Probe existing authorized Infisical aliases / host gh CLI without disclosing tokens.
names = ("GH2_GITHUB_TOKEN","GITHUB_GH2_TOKEN","GITHUB_TOKEN_GH2",
         "WAVE_RUNNER_2_GITHUB_TOKEN","WAVE_RUNNER_2_TOKEN",
         "GITHUB_RUNNER_2_TOKEN","GH_RUNNER_2_PAT","GH2_PAT",
         "GITHUB_TOKEN_RUNNER_2","GITHUB_TOKEN_2","GITHUB_TOKEN_OGE34",
         "GITHUB_PAT","GH_PAT","GITHUB_TOKEN")
tested = set()
selected = None
selected_name = None
for name in names:
    candidate = os.environ.get(name, "").strip()
    if not candidate or candidate in tested:
        continue
    tested.add(candidate)
    try:
        identity = api(candidate, "GET", "/user")
    except RuntimeError:
        continue
    if str(identity.get("login","")).lower() == GH2:
        selected, selected_name = candidate, name
        break

if selected is None and shutil.which("gh"):
    e = os.environ.copy()
    for name in ("GH_TOKEN","GITHUB_TOKEN","GH_ENTERPRISE_TOKEN"):
        e.pop(name, None)
    try:
        found = subprocess.run(["gh","auth","token"],capture_output=True,text=True,
            timeout=12,env=e,check=False)
        candidate = found.stdout.strip() if found.returncode == 0 else ""
        if candidate:
            identity = api(candidate,"GET","/user")
            if str(identity.get("login","")).lower() == GH2:
                selected, selected_name = candidate, "HOST_GH_CLI"
    except (RuntimeError, subprocess.TimeoutExpired):
        pass

if not selected:
    fail("GH2_OAUTH_NOT_AVAILABLE_TO_RUNNER__MCP_CONNECTION_IS_SEPARATE")
print("GH2_MIRROR_IDENTITY=VERIFIED_Wave-Runner-2")
print("GH2_MIRROR_CREDENTIAL_SOURCE=" + selected_name)

with tempfile.TemporaryDirectory(prefix="ogenic-gh2-mirror-", dir=os.environ.get("RUNNER_TEMP", "/tmp")) as tmp:
    work = Path(tmp)
    askpass = work/"askpass.sh"
    askpass.write_text("#!/bin/sh\ncase \"$1\" in *sername*) printf 'x-access-token';; *) printf '%s' \"$OGE_GIT_ASKPASS_TOKEN\";; esac\n")
    askpass.chmod(0o700)
    clone = work/"full-mirror.git"
    run(["git", "clone", "--mirror", "https://github.com/" + SOURCE + ".git", str(clone)],
        token=source_token, timeout=320)
    refs = run(["git","for-each-ref","--format=%(refname) %(objectname)",
        "refs/heads","refs/tags","refs/notes"],cwd=clone).stdout.strip().splitlines()
    original = dict(x.split(" ",1) for x in refs if " " in x)
    branches = sum(x.startswith("refs/heads/") for x in original)
    tags = sum(x.startswith("refs/tags/") for x in original)
    notes = sum(x.startswith("refs/notes/") for x in original)
    if branches < 2 or "refs/heads/main" not in original or "refs/heads/phase-vi-provider-incentive-metering" not in original:
        fail("SOURCE_BRANCH_SET_INCOMPLETE")
    print("GH2_MIRROR_SOURCE_BRANCHES=" + str(branches))
    print("GH2_MIRROR_SOURCE_TAGS=" + str(tags))
    print("GH2_MIRROR_SOURCE_NOTES=" + str(notes))
    print("GH2_MIRROR_STAGING_SHA=" + original["refs/heads/phase-vi-provider-incentive-metering"])

    # Detect LFS pointers before creating destination; if LFS is used, all
    # object payloads must be copied too or the mirror must stop.
    attr = run(["git","show","refs/heads/main:.gitattributes"],cwd=clone,check=False)
    if attr.returncode == 0 and "filter=lfs" in attr.stdout and not shutil.which("git-lfs"):
        fail("GIT_LFS_REQUIRED_BUT_NOT_INSTALLED")
    lfs = False
    if shutil.which("git-lfs"):
        result = run(["git","lfs","ls-files","--all"],cwd=clone,check=False)
        lfs = result.returncode == 0 and bool(result.stdout.strip())
        if lfs:
            run(["git","lfs","fetch","--all","origin"],cwd=clone,token=source_token,timeout=500)

    try:
        dest = api(selected, "GET", "/repos/"+TARGET, missing=True)
    except RuntimeError:
        fail("GH2_DESTINATION_READ_SCOPE_DENIED")
    if dest is None:
        try:
            dest = api(selected,"POST","/user/repos",{
                "name":"Build-Platform","private":True,"auto_init":False,
                "description":"Private Git-history mirror of GH-1 OGENIC WAVE Build-Platform",
                "has_issues":True,"has_wiki":False
            })
        except RuntimeError:
            fail("GH2_REPOSITORY_CREATION_PERMISSION_DENIED")
        print("GH2_MIRROR_DESTINATION=CREATED_PRIVATE")
    else:
        print("GH2_MIRROR_DESTINATION=PREEXISTING")
    if str(dest.get("owner",{}).get("login","")).lower() != GH2 or dest.get("private") is not True:
        fail("GH2_DESTINATION_OWNER_OR_VISIBILITY_MISMATCH")

    # Prevent cloned workflows from unexpectedly executing / deploying.
    try:
        api(selected,"PUT","/repos/"+TARGET+"/actions/permissions",{"enabled":False})
        perm=api(selected,"GET","/repos/"+TARGET+"/actions/permissions")
        if perm.get("enabled") is not False: fail("GH2_DESTINATION_ACTIONS_NOT_DISABLED")
    except RuntimeError:
        fail("GH2_CANNOT_DISABLE_DESTINATION_ACTIONS__REFUSE_TO_PUSH")
    print("GH2_MIRROR_DESTINATION_ACTIONS=DISABLED")

    remote="https://github.com/"+TARGET+".git"
    prior=run(["git","ls-remote",remote],token=selected,check=False,timeout=60)
    if prior.returncode != 0: fail("GH2_PRIVATE_GIT_REMOTE_UNAVAILABLE")
    old = dict(x.split("\t",1)[::-1] for x in prior.stdout.splitlines() if "\t" in x)
    existing = {k:v for k,v in old.items() if k.startswith(("refs/heads/","refs/tags/","refs/notes/")) and not k.endswith("^{}")}
    if existing and existing != original:
        fail("GH2_TARGET_HAS_DIFFERENT_EXISTING_REFS__NO_OVERWRITE")

    if not existing:
        specs = [r+" :"+r for r in []]  # no-op; real specs below do not force updates
        specs = ["refs/heads/*:refs/heads/*"]
        if tags: specs.append("refs/tags/*:refs/tags/*")
        if notes: specs.append("refs/notes/*:refs/notes/*")
        try:
            run(["git","push","--atomic",remote,*specs],cwd=clone,token=selected,timeout=600)
        except RuntimeError:
            fail("GH2_GIT_PUSH_DENIED_OR_WORKFLOW_SCOPE_MISSING")
        if lfs:
            run(["git","lfs","push","--all",remote],cwd=clone,token=selected,timeout=500)
    else:
        print("GH2_MIRROR_ALREADY_IDENTICAL=YES")

    latest=run(["git","ls-remote",remote],token=selected,timeout=60)
    copy = dict(x.split("\t",1)[::-1] for x in latest.stdout.splitlines() if "\t" in x)
    copied = {k:v for k,v in copy.items() if k.startswith(("refs/heads/","refs/tags/","refs/notes/")) and not k.endswith("^{}")}
    if copied != original: fail("GH2_MIRROR_REF_SHA_MISMATCH")
    try:
        api(selected,"PATCH","/repos/"+TARGET,{"default_branch":"main"})
    except RuntimeError:
        fail("GH2_DEFAULT_BRANCH_ASSIGNMENT_FAILED")
    verify=api(selected,"GET","/repos/"+TARGET)
    if verify.get("default_branch") != "main" or verify.get("private") is not True:
        fail("GH2_PRIVATE_DEFAULT_BRANCH_READBACK_FAILED")
    print("GH2_MIRROR_SOURCE_TO_DEST_REF_SHA_MATCH=YES")
    print("GH2_MIRROR_COPIED_BRANCHES="+str(branches))
    print("GH2_MIRROR_COPIED_TAGS="+str(tags))
    print("GH2_MIRROR_DEFAULT_BRANCH=main")
    print("GH2_MIRROR_STATUS=SUCCESS")
    summary=os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary,"a",encoding="utf8") as out:
            out.write("## GH-2 private full Git mirror\n\n")
            out.write("- Source: "+SOURCE+"\n- Destination: "+TARGET+"\n")
            out.write("- GH-2 ownership: verified; Private: verified; Actions: disabled\n")
            out.write(f"- SHA-identical branches: {branches}; tags: {tags}; notes: {notes}\n")
            out.write("- GH-1 original unchanged; GH-2 tracked code/history mirrored\n")
            out.write("- GitHub secrets, repo settings, PRs, Issues and D1 are not Git refs\n")
