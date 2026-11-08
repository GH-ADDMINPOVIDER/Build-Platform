# Chooses where the job runs: the OCIAN self-hosted machine if one with PRIMARY_LABEL is online, else GitHub-hosted.
import os, json, _lib as L
cfg = json.load(open("route.json"))
order = cfg.get("order", [])
label = None
try:
    c = L.load()
    H = {"Authorization": "Bearer " + c["gh_pat"], "X-GitHub-Api-Version": "2022-11-28"}
    s, b = L.call(f"https://api.github.com/repos/{L.REPO}/actions/runners?per_page=100", H)
    online = set()
    for m in (L.js(b).get("runners") or []):
        if m.get("status") == "online":
            online |= {l["name"] for l in m.get("labels", [])}
    label = next((x for x in order if x in online), None)
    L.out("machine check HTTP", s, "->", label or "GitHub-hosted")
except Exception as e:
    L.out("machine check failed:", type(e).__name__, "-> GitHub-hosted")
runs_on = json.dumps(["self-hosted", label]) if label else json.dumps(cfg.get("fallback", "ubuntu-latest"))
with open(os.environ["GITHUB_OUTPUT"], "a") as f:
    f.write("runs_on=" + runs_on + "\n")
