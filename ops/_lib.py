"""Shared helpers for operator ops. Runs only inside GitHub Actions.
Tokens come from Infisical through GitHub OIDC, live only in this job's memory, and are masked.
Never print secret values. Output goes through redact()."""
import os, re, json, urllib.request, urllib.parse, urllib.error

BASE = "https://app.infisical.com"
PROJECT = "e8cfba67-ea99-4d79-bc9f-87b862f9129c"
IDENTITY = "b0962d69-bd33-4ac3-b4f4-48589535ca38"
AUD = "https://github.com/GH-ADDMINPOVIDER"
REPO = "GH-ADDMINPOVIDER/Build-Platform"
D1_STAGING = "b4ac3a33-df80-47cf-8e75-7574e025b87b"
RAILWAY = {"project": "59d58346-9de2-426a-adb9-1484dc4c596a", "env": "f42e6093-7126-4485-afe1-842bafff23fb"}

_SECRET = re.compile(r"(eyJ[A-Za-z0-9_\-]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_\-]{20,})")


def redact(s):
    return _SECRET.sub("[REDACTED]", str(s))


def out(*a):
    print(redact(" ".join(str(x) for x in a)))


def call(url, headers=None, data=None, method=None):
    h = {"User-Agent": "GH-ADDMINPOVIDER-operator", "Accept": "application/json"}
    h.update(headers or {})
    b = None
    if data is not None:
        h["Content-Type"] = "application/json"
        b = json.dumps(data).encode()
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=h, data=b, method=method), timeout=30) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()
    except Exception as e:
        return 0, type(e).__name__.encode()


def js(b):
    try:
        return json.loads(b)
    except Exception:
        return {}


def args():
    return js(os.environ.get("ARGS") or "{}")


def _oidc_login():
    u = urllib.parse.urlsplit(os.environ["ACTIONS_ID_TOKEN_REQUEST_URL"])
    q = urllib.parse.urlencode(urllib.parse.parse_qsl(u.query) + [("audience", AUD)])
    s, b = call(urllib.parse.urlunsplit(u._replace(query=q)), {"Authorization": "Bearer " + os.environ["ACTIONS_ID_TOKEN_REQUEST_TOKEN"]})
    s, b = call(BASE + "/api/v1/auth/oidc-auth/login", data={"identityId": IDENTITY, "jwt": js(b)["value"]})
    return js(b)["accessToken"]


def load(env="staging"):
    """Return normalized credentials. Names only are ever printed."""
    tok = _oidc_login()
    q = urllib.parse.urlencode({"workspaceId": PROJECT, "environment": env, "secretPath": "/", "recursive": "true", "viewSecretValue": "true"})
    s, b = call(BASE + "/api/v3/secrets/raw?" + q, {"Authorization": "Bearer " + tok})
    raw = {x["secretKey"]: (x["secretValue"] or "").strip() for x in js(b).get("secrets", [])}
    for v in raw.values():
        for line in v.splitlines():
            if line.strip():
                print("::add-mask::" + line.strip())

    def first(*names, contains=None):
        for n in names:
            if raw.get(n):
                return raw[n]
        if contains:
            for k, v in raw.items():
                if contains in k.upper() and v:
                    return v
        return ""

    return {
        "cf_token": first("CLOUDFLARE_API_TOKEN"),
        "cf_account": first("CLOUDFLARE_ACCOUNT_ID"),
        "rw_token": first(contains="RAILWAY"),
        "gh_pat": first("GH_ADDMINPROVIDER-FINE_GRAINED"),
        "vercel": first("VERCEL_ACCESS_TOKEN"),
        "linear": first("LINEAR_API_KEY"),
        "notion": first("NOTION_TOKEN"),
    }
