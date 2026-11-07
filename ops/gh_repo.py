import _lib as L
c = L.load(); a = L.args()
H = {"Authorization": "Bearer " + c["gh_pat"], "X-GitHub-Api-Version": "2022-11-28"}
s, b = L.call(f"https://api.github.com/repos/{L.REPO}", H); d = L.js(b); p = d.get("permissions") or {}
L.out("repo: HTTP", s, "private", d.get("private"), "visibility", d.get("visibility"), "admin", p.get("admin"))
if a.get("apply") and "private" in a:
    s, b = L.call(f"https://api.github.com/repos/{L.REPO}", H, {"private": bool(a["private"])}, method="PATCH")
    L.out("set private =", a["private"], ": HTTP", s, (L.js(b).get("message") or "")[:80])
