# Terminal on the GitHub-hosted machine. args: {"cmd": "<bash>", "timeout": 600}
# Tokens are placed in the environment (names below); the values are masked in the log and redacted from the output here.
import os, subprocess, _lib as L
c = L.load(); a = L.args()
cmd = a.get("cmd")
if not cmd:
    L.out("no cmd given"); raise SystemExit(1)
env = dict(os.environ)
env.update({
    "CLOUDFLARE_API_TOKEN": c["cf_token"], "CLOUDFLARE_ACCOUNT_ID": c["cf_account"],
    "RAILWAY_TOKEN": c["rw_token"], "GH_TOKEN": c["gh_pat"], "VERCEL_TOKEN": c["vercel"],
    "LINEAR_API_KEY": c["linear"], "NOTION_TOKEN": c["notion"],
})
vals = [v for v in c.values() if v and len(v) > 6]
try:
    p = subprocess.run(["bash", "-lc", cmd], env=env, capture_output=True, text=True, timeout=int(a.get("timeout", 600)))
    out = (p.stdout or "") + (p.stderr or ""); rc = p.returncode
except subprocess.TimeoutExpired:
    out, rc = "timeout", 124
for v in vals:
    out = out.replace(v, "[REDACTED]")
print(L.redact(out)[:60000])
L.out("exit code", rc)
raise SystemExit(0 if rc == 0 else 1)
