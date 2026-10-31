"""Read existing host binding and verify the sole operational API identity.

Run inside the existing root Infisical session. Never emit credentials or raw
CLI/systemd payloads. No service, account, registration or profile mutation.
"""
import json
import os
import pathlib
import re
import subprocess
import urllib.error
import urllib.parse
import urllib.request

REPOSITORY_ID = 1429580446
PRINCIPAL_ID = 342175560
REFERENCE = "GH_ADDMINPROVIDER-FINE_GRAINED"


def registration_directory(fields, is_file=lambda p: p.is_file()):
    candidates = []
    if fields.get("WorkingDirectory", "").startswith("/"):
        candidates.append(pathlib.Path(fields["WorkingDirectory"]))
    match = re.search(r"(?:^|[ {;])path=([^;]+);", fields.get("ExecStart", ""))
    if match:
        executable = pathlib.Path(match.group(1).strip())
        if executable.is_absolute():
            candidates.append(executable.parent)
    for directory in candidates:
        if is_file(directory / ".runner"):
            return directory
    return None


def safe_repository_url(value):
    parsed = urllib.parse.urlsplit(str(value or ""))
    if parsed.scheme != "https" or parsed.netloc != "github.com" or parsed.query or parsed.fragment:
        return None
    if not re.fullmatch(r"/[A-Za-z0-9_.-]{1,100}/[A-Za-z0-9_.-]{1,100}/?", parsed.path):
        return None
    return "https://github.com" + parsed.path.rstrip("/")


def inspect_binding(api, run=subprocess.check_output, read_config=None):
    result = {"schema": "UNIFIEND_HOST_BINDING_V1", "operations": "READ_ONLY", "services": [], "ok": False}
    stage = "provider_identity"
    try:
        if api("/user").get("id") != PRINCIPAL_ID:
            raise ValueError("OPERATIONAL_IDENTITY_MISMATCH")
        result["provider_principal_verified"] = True
        stage = "primary_repository"
        repo = api(f"/repositories/{REPOSITORY_ID}")
        if repo.get("id") != REPOSITORY_ID or repo.get("owner", {}).get("id") != PRINCIPAL_ID:
            raise ValueError("REPOSITORY_IDENTITY_MISMATCH")
        target = safe_repository_url(repo.get("html_url"))
        full_name = repo.get("full_name")
        if not target or target != f"https://github.com/{full_name}":
            raise ValueError("REPOSITORY_URL_NOT_VERIFIED")
        result["primary_repository_id"] = REPOSITORY_ID
        stage = "primary_registrations"
        inventory = api(f"/repos/{full_name}/actions/runners?per_page=100")
        machines = inventory.get("runners")
        if not isinstance(machines, list) or inventory.get("total_count", 0) > len(machines):
            raise ValueError("INCOMPLETE_REGISTRATION_INVENTORY")
        result["primary_registration_count"] = len(machines)
        stage = "service_binding"
        units = run(["systemctl", "list-units", "--all", "--type=service", "--no-legend", "--plain", "--no-pager", "actions.*"], text=True, timeout=10)
        for line in units.splitlines():
            unit = line.split()[0]
            raw = run(["systemctl", "show", unit, "-p", "WorkingDirectory", "-p", "ExecStart", "-p", "ActiveState", "-p", "User", "--no-pager"], text=True, timeout=10)
            fields = dict(part.split("=", 1) for part in raw.splitlines() if "=" in part)
            item = {"service_state": fields.get("ActiveState"), "service_user": fields.get("User") or "root"}
            result["services"].append(item)
            directory = registration_directory(fields)
            if directory is None:
                item["binding_state"] = "CONFIG_NOT_RESOLVED"
                continue
            config = read_config(directory) if read_config else json.loads((directory / ".runner").read_text())
            binding = safe_repository_url(config.get("gitHubUrl"))
            item["repository_binding"] = binding or "UNVERIFIED"
            item["registration_id"] = config.get("agentId") if type(config.get("agentId")) is int else None
            item["bound_to_primary"] = binding == target
            matches = [m for m in machines if m.get("id") == item["registration_id"] and m.get("name") == config.get("agentName")]
            item["registered_in_primary"] = item["bound_to_primary"] and len(matches) == 1
            item["binding_state"] = "PRIMARY_VERIFIED" if item["registered_in_primary"] else "DIFFERENT_OR_STALE_BINDING"
            if item["registered_in_primary"]:
                item["provider_status"] = matches[0].get("status") if matches[0].get("status") in ("online", "offline") else "UNKNOWN"
                item["busy"] = matches[0].get("busy") is True
        result["ok"] = bool(result["services"]) and all(s.get("binding_state") == "PRIMARY_VERIFIED" for s in result["services"])
    except Exception as error:
        allowed = {"OPERATIONAL_IDENTITY_MISMATCH", "REPOSITORY_IDENTITY_MISMATCH", "REPOSITORY_URL_NOT_VERIFIED", "INCOMPLETE_REGISTRATION_INVENTORY"}
        result["failure"] = {"stage": stage, "code": str(error) if str(error) in allowed else "READ_UNAVAILABLE", "http_status": error.code if isinstance(error, urllib.error.HTTPError) else None}
    return result


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def main():
    token = os.environ.get(REFERENCE, "")
    if not token.startswith("github_pat_") or not re.fullmatch(r"[\x21-\x7e]+", token):
        print(json.dumps({"ok": False, "failure": {"stage": "credential_reference", "code": "CANONICAL_REFERENCE_MISSING_OR_INVALID"}}))
        return 1
    opener = urllib.request.build_opener(NoRedirect())

    def api(path):
        request = urllib.request.Request("https://api.github.com" + path, headers={
            "Authorization": "Bearer " + token, "Accept": "application/vnd.github+json", "User-Agent": "Unifiend-host-binding", "X-GitHub-Api-Version": "2022-11-28"})
        with opener.open(request, timeout=15) as response:
            return json.load(response)

    report = inspect_binding(api)
    print(json.dumps(report))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
