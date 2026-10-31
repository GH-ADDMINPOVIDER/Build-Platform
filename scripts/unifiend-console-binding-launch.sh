#!/usr/bin/env bash
# Existing root Console + existing Infisical session. Pinned read-only source.
set +x
infisical run --projectId=e8cfba67-ea99-4d79-bc9f-87b862f9129c --env=staging --path=/ -- python3 - <<'UNIFIEND_BINDING'
import os, json, base64, hashlib, urllib.request, sys
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs): return None
try:
    url = 'https://api.github.com/repos/Wave-Runner-2/Build-Platform/contents/scripts/unifiend-host-binding.py?ref=aca5b036db313a6009bf60967897aaf66ea3d3ee'
    request = urllib.request.Request(url, headers={'Authorization':'Bearer '+os.environ['GH_ADDMINPROVIDER-FINE_GRAINED'], 'Accept':'application/vnd.github+json', 'User-Agent':'Unifiend-Console'})
    with urllib.request.build_opener(NoRedirect()).open(request, timeout=20) as response:
        code = base64.b64decode(json.load(response)['content'])
    if hashlib.sha256(code).hexdigest() != 'cdba25f7822fb9dbc08ac8be1d4d66862d87b65c73c4bfd984f998129722b077':
        raise ValueError('SOURCE_MISMATCH')
except Exception as error:
    print(json.dumps({'loader':'READ_UNAVAILABLE', 'http_status':getattr(error, 'code', None)}))
    raise SystemExit(1)
exec(compile(code, 'unifiend-host-binding.py', 'exec'))
UNIFIEND_BINDING
