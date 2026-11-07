import re, json
import _lib as L
c = L.load(); a = L.args()
sql = a.get("sql", "SELECT name FROM sqlite_master WHERE type='table' LIMIT 5")
db = a.get("db", L.D1_STAGING)
if not a.get("apply") and not re.match(r"^\s*(select|pragma)\b", sql, re.I):
    raise SystemExit("write statements need args.apply=true")
s, b = L.call(f"https://api.cloudflare.com/client/v4/accounts/{c['cf_account']}/d1/database/{db}/query",
              {"Authorization": "Bearer " + c["cf_token"]}, {"sql": sql})
d = L.js(b)
L.out("d1 query: HTTP", s, "success", d.get("success"), "errors", json.dumps(d.get("errors"))[:200])
for r in (d.get("result") or []):
    L.out(json.dumps(r.get("results"), ensure_ascii=False)[:4000])
