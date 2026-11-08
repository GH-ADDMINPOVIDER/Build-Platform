import _lib as L
c = L.load(); a = L.args()
H = {"Authorization": "Bearer " + c["gh_pat"], "X-GitHub-Api-Version": "2022-11-28"}
s, b = L.call(f"https://api.github.com/repos/{L.REPO}/actions/runners?per_page=100", H)
d = L.js(b); ms = d.get("runners") or []
L.out("registered self-hosted machines: HTTP", s, "count", len(ms))
for m in ms:
    L.out(" -", m.get("name"), "| status", m.get("status"), "| busy", m.get("busy"), "| labels", ",".join(l["name"] for l in m.get("labels", [])))
if a.get("apply") and a.get("remove_offline"):
    for m in ms:
        if m.get("status") == "offline":
            s2, _ = L.call(f"https://api.github.com/repos/{L.REPO}/actions/runners/{m['id']}", H, method="DELETE")
            L.out("remove offline", m.get("name"), ": HTTP", s2)
