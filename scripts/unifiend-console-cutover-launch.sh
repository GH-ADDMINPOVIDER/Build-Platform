#!/usr/bin/env bash
# Existing root Console only. Default is plan; apply is explicit.
set -euo pipefail
set +x
INFISICAL_PROFILE=codex-terminal infisical run --projectId=e8cfba67-ea99-4d79-bc9f-87b862f9129c --env=staging --path=/ -- python3 - "$@" <<'UNIFIEND_CONSOLE'
import base64, hashlib, json, os, sys, types, urllib.request
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None
revision = "2b0c762bf600c5638df95cfe65df4c4294b80ce8"
sources = {"scripts/unifiend-host-cutover.py":"5d387aa3a8f9b60d13bbb0fae2c55cfc3d85608da912c5d89dbf33f1c341f30c","scripts/unifiend-codex-plan.py":"a10de849912cf0919bbea47e8ce772c488b44e313a19e97ced4731c58f31db64","scripts/unifiend-host-tools.py":"4c4e2ef987ab8498a13613a91844adfd62ce71ff259faf588deeffe7622ffe5c"}
loaded = {}
try:
    opener = urllib.request.build_opener(NoRedirect())
    for path, digest in sources.items():
        url = "https://api.github.com/repos/Wave-Runner-2/Build-Platform/contents/" + path + "?ref=" + revision
        request = urllib.request.Request(url, headers={
            "Authorization": "Bearer " + os.environ["GH_ADDMINPROVIDER-FINE_GRAINED"],
            "Accept": "application/vnd.github+json", "User-Agent": "Unifiend-Console"})
        with opener.open(request, timeout=20) as response:
            data = json.load(response)
        code = base64.b64decode(data["content"], validate=False)
        if hashlib.sha256(code).hexdigest() != digest:
            raise ValueError("SOURCE_MISMATCH")
        loaded[path] = compile(code, path, "exec")
except Exception as error:
    print(json.dumps({"loader": "READ_UNAVAILABLE", "http_status": getattr(error, "code", None)}))
    raise SystemExit(1)
for name, path in [("unifiend_codex_plan", "scripts/unifiend-codex-plan.py"),
                   ("unifiend_host_tools", "scripts/unifiend-host-tools.py")]:
    module = types.ModuleType(name)
    sys.modules[name] = module
    exec(loaded[path], module.__dict__)
exec(loaded["scripts/unifiend-host-cutover.py"], {"__name__": "__main__"})
UNIFIEND_CONSOLE

