import _lib as L
c = L.load()
L.out("present:", ", ".join(k for k, v in c.items() if v) or "(none)")
if c["cf_token"] and c["cf_account"]:
    a = c["cf_account"]; h = {"Authorization": "Bearer " + c["cf_token"]}
    s, b = L.call(f"https://api.cloudflare.com/client/v4/accounts/{a}/tokens/verify", h)
    L.out("cloudflare account-verify: HTTP", s, (L.js(b).get("result") or {}).get("status", ""))
    s, b = L.call(f"https://api.cloudflare.com/client/v4/accounts/{a}/workers/scripts", h)
    L.out("cloudflare workers: HTTP", s, "count", len(L.js(b).get("result") or []))
    s, b = L.call(f"https://api.cloudflare.com/client/v4/accounts/{a}/d1/database", h)
    L.out("cloudflare d1: HTTP", s, "dbs", ",".join(x.get("name", "") for x in (L.js(b).get("result") or [])))
if c["rw_token"]:
    s, b = L.call("https://backboard.railway.com/graphql/v2", {"Project-Access-Token": c["rw_token"]}, {"query": "{ projectToken { projectId } }"})
    L.out("railway project token: HTTP", s, "ok" if (L.js(b).get("data") or {}).get("projectToken") else "no")
if c["gh_pat"]:
    H = {"Authorization": "Bearer " + c["gh_pat"], "X-GitHub-Api-Version": "2022-11-28"}
    s, b = L.call(f"https://api.github.com/repos/{L.REPO}", H); d = L.js(b); p = d.get("permissions") or {}
    L.out("github repo: HTTP", s, "private", d.get("private"), "admin", p.get("admin"), "push", p.get("push"))
if c["vercel"]:
    L.out("vercel: HTTP", L.call("https://api.vercel.com/v2/user", {"Authorization": "Bearer " + c["vercel"]})[0])
if c["linear"]:
    L.out("linear: HTTP", L.call("https://api.linear.app/graphql", {"Authorization": c["linear"]}, {"query": "{viewer{id}}"})[0])
if c["notion"]:
    L.out("notion: HTTP", L.call("https://api.notion.com/v1/users/me", {"Authorization": "Bearer " + c["notion"], "Notion-Version": "2022-06-28"})[0])
L.out("skipped by owner order: xai and other credit-blocked providers")
