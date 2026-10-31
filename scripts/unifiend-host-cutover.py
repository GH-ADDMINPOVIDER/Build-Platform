"""Move the existing execution installation to the verified primary repository.

No archived-provider mutation, new host, package installation or Codex profile
change. Old local registration files are moved into a root-only recovery
directory; credential values are never copied into code, logs or API payloads.
"""
import argparse
import base64
import datetime
import fcntl
import hashlib
import json
import os
import pathlib
import pwd
import re
import subprocess
import time
import urllib.error
import urllib.request

ROOT = pathlib.Path("/opt/wave/actions-runner")
RECOVERY = ROOT / ".unifiend-cutover"
PRIMARY_ID = 1429580446
PRINCIPAL_ID = 342175560
OLD_URL = "https://github.com/Ogenicchocolate21debug/Build-Platform"
NAME = "Ocian-S-Host"
LABEL = "unifiend-capability"
PIN = "SHA256:rtBc5XsEuZwLAOI80yuTbB6JmAgWfO8Nj1rkf5RYtdQ"
HOST_PUBLIC_KEY = pathlib.Path("/etc/ssh/ssh_host_ed25519_key.pub")
STATE_FILES = (".runner", ".runner_migrated", ".credentials", ".credentials_migrated", ".credentials_rsaparams", ".env", ".path", "svc.sh")


class CutoverBlocked(Exception):
    def __init__(self, code, exit_code=None):
        super().__init__(code)
        self.exit_code = exit_code


def worker_active(proc=pathlib.Path("/proc")):
    for entry in proc.glob("[0-9]*/comm"):
        try:
            if entry.read_text().strip() == "Runner.Worker":
                return True
        except FileNotFoundError:
            continue
    return False


def read_config(path):
    value = json.loads(path.read_text(encoding="utf-8-sig"))
    if not isinstance(value, dict):
        raise CutoverBlocked("CONFIG_SHAPE_INVALID")
    return value


def verified_target(repo):
    if repo.get("id") != PRIMARY_ID or repo.get("owner", {}).get("id") != PRINCIPAL_ID:
        raise CutoverBlocked("PRIMARY_IDENTITY_MISMATCH")
    full_name = repo.get("full_name", "")
    if not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", full_name) or repo.get("html_url") != "https://github.com/" + full_name:
        raise CutoverBlocked("PRIMARY_URL_NOT_VERIFIED")
    return "/repos/" + full_name


def validate_preflight(config, repo, machines, pin, busy):
    if pin != PIN:
        raise CutoverBlocked("EXISTING_HOST_PIN_MISMATCH")
    verified_target(repo)
    if busy:
        raise CutoverBlocked("ACTIVE_WORK_PRESERVED")
    if config.get("gitHubUrl") == repo["html_url"]:
        matches = [m for m in machines if m.get("id") == config.get("agentId") and m.get("name") == NAME]
        if len(matches) != 1 or len(machines) != 1:
            raise CutoverBlocked("PRIMARY_REGISTRATION_NOT_UNIQUE")
        return "PRIMARY_ALREADY_BOUND"
    if config.get("gitHubUrl") != OLD_URL or config.get("agentId") != 21:
        raise CutoverBlocked("UNEXPECTED_EXISTING_BINDING")
    if machines:
        raise CutoverBlocked("PRIMARY_NOT_EMPTY_PRESERVED")
    return "REUSE_EXISTING_INSTALLATION"


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def perform_cutover(api, apply=False):
    report = {"schema": "UNIFIEND_HOST_CUTOVER_V1", "host": NAME, "applied": False, "ok": False,
              "archived_provider_write": False, "codex_profiles_changed": False}
    stage = "host_preflight"
    lock = None
    stopped = False

    def command(args, *, token=None, user=None, timeout=120):
        environment = {"PATH": "/usr/local/bin:/usr/bin:/bin", "LANG": "C.UTF-8"}
        if token:
            environment["ACTIONS_RUNNER_INPUT_TOKEN"] = token
        if user:
            args = ["/usr/bin/sudo", "-n", "-E", "-H", "-u", user, *args]
        result = subprocess.run(args, cwd=ROOT, env=environment, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=timeout)
        if result.returncode:
            raise CutoverBlocked("HOST_COMMAND_FAILED", result.returncode)
        return result

    try:
        if os.geteuid() != 0 or ROOT.is_symlink() or not ROOT.is_dir():
            raise CutoverBlocked("EXISTING_ROOT_CONSOLE_REQUIRED")
        if RECOVERY.exists() and (RECOVERY.is_symlink() or RECOVERY.stat().st_uid != 0):
            raise CutoverBlocked("RECOVERY_DIRECTORY_UNTRUSTED")
        RECOVERY.mkdir(mode=0o700, exist_ok=True)
        os.chmod(RECOVERY, 0o700)
        descriptor = os.open(RECOVERY / "operation.lock", os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
        lock = os.fdopen(descriptor, "a")
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise CutoverBlocked("EXISTING_CUTOVER_IN_PROGRESS")
        public = HOST_PUBLIC_KEY.read_text().split()
        pin = "SHA256:" + base64.b64encode(hashlib.sha256(base64.b64decode(public[1])).digest()).decode().rstrip("=")
        config_path = ROOT / ".runner"
        if not config_path.exists():
            config_path = RECOVERY / ".runner"
        config = read_config(config_path)
        stage = "provider_identity"
        if api("/user").get("id") != PRINCIPAL_ID:
            raise CutoverBlocked("OPERATIONAL_PRINCIPAL_MISMATCH")
        repo = api(f"/repositories/{PRIMARY_ID}")
        endpoint = verified_target(repo)
        inventory = api(endpoint + "/actions/runners?per_page=100")
        machines = inventory.get("runners", [])
        if not isinstance(machines, list) or type(inventory.get("total_count")) is not int or inventory["total_count"] > len(machines):
            raise CutoverBlocked("REGISTRATION_INVENTORY_INCOMPLETE")
        mode = validate_preflight(config, repo, machines, pin, worker_active())
        report["preflight"] = mode
        account = pwd.getpwnam("wave")
        old_unit = None
        if mode != "PRIMARY_ALREADY_BOUND":
            path = ROOT / ".service"
            if path.exists():
                old_unit = path.read_text().strip()
            state_path = RECOVERY / "state.json"
            if not old_unit and state_path.exists():
                old_unit = read_config(state_path).get("old_unit")
            if not old_unit or not re.fullmatch(r"actions\.[A-Za-z0-9_.@-]+\.service", old_unit):
                raise CutoverBlocked("EXISTING_SERVICE_IDENTITY_UNVERIFIED")
            properties = command(["/usr/bin/systemctl", "show", old_unit, "-p", "ExecStart", "-p", "User", "--no-pager"], timeout=10).stdout.decode()
            fields = dict(line.split("=", 1) for line in properties.splitlines() if "=" in line)
            executable = re.search(r"(?:^|[ {;])path=([^;]+);", fields.get("ExecStart", ""))
            if fields.get("User") != account.pw_name or not executable or pathlib.Path(executable.group(1).strip()) != ROOT / "runsvc.sh":
                raise CutoverBlocked("EXISTING_SERVICE_EXECUTION_SCOPE_CHANGED")
        if not apply:
            report.update(ok=True, state="PLAN_READY", target_repository_id=PRIMARY_ID, target_name=NAME, target_label=LABEL)
            return report
        if mode != "PRIMARY_ALREADY_BOUND":
            # Check all destinations before stopping a working service. Never
            # discover a collision after native service removal has begun.
            for name in STATE_FILES:
                source, destination = ROOT / name, RECOVERY / name
                if source.is_symlink() or destination.is_symlink():
                    raise CutoverBlocked("CONFIGURATION_SYMLINK_REJECTED")
                if source.exists() and destination.exists():
                    raise CutoverBlocked("RECOVERY_STATE_COLLISION")
            stage = "primary_registration_permission"
            registration = api(endpoint + "/actions/runners/registration-token", method="POST")
            token = registration.get("token")
            if not isinstance(token, str) or not token or any(c in token for c in "\x00\r\n"):
                raise CutoverBlocked("REGISTRATION_TOKEN_NOT_VERIFIED")
            try:
                expiry = datetime.datetime.fromisoformat(registration["expires_at"].replace("Z", "+00:00"))
                if expiry.timestamp() < time.time() + 300:
                    raise ValueError("expiry")
            except (KeyError, TypeError, ValueError):
                raise CutoverBlocked("REGISTRATION_EXPIRY_NOT_VERIFIED")
            # Verify execution as the existing account before touching its service.
            command(["/usr/bin/true"], user=account.pw_name, timeout=10)
            command(["/usr/bin/test", "-w", str(ROOT)], user=account.pw_name, timeout=10)
            stage = "stop_existing_service"
            if worker_active():
                raise CutoverBlocked("ACTIVE_WORK_PRESERVED")
            command(["/usr/bin/systemctl", "stop", old_unit], timeout=120)
            stopped = True
            if worker_active():
                raise CutoverBlocked("ACTIVE_WORK_DETECTED_AFTER_STOP")
            state_path = RECOVERY / "state.json"
            state_path.write_text(json.dumps({"old_unit": old_unit, "target_repository_id": PRIMARY_ID, "phase": "LOCAL_STATE_PRESERVED"}))
            os.chmod(state_path, 0o600)
            stage = "remove_old_service_only"
            script = ROOT / "svc.sh"
            if script.exists():
                command([str(script), "uninstall"])
            stage = "preserve_local_configuration"
            for name in STATE_FILES:
                source, destination = ROOT / name, RECOVERY / name
                if source.is_symlink():
                    raise CutoverBlocked("CONFIGURATION_SYMLINK_REJECTED")
                if source.exists():
                    if destination.exists():
                        raise CutoverBlocked("RECOVERY_STATE_COLLISION")
                    source.rename(destination)
            stage = "configure_existing_installation_for_primary"
            command([str(ROOT / "config.sh"), "--unattended", "--url", repo["html_url"], "--name", NAME,
                     "--no-default-labels", "--labels", LABEL, "--work", "_work-unifiend"], user=account.pw_name, token=token)
            del token
            report["applied"] = True
        stage = "verify_local_primary_configuration"
        configured = read_config(ROOT / ".runner")
        if configured.get("gitHubUrl") != repo["html_url"] or configured.get("agentName") != NAME:
            raise CutoverBlocked("LOCAL_PRIMARY_READBACK_MISMATCH")
        stage = "install_primary_service"
        if not (ROOT / ".service").exists():
            command([str(ROOT / "svc.sh"), "install", account.pw_name])
        command([str(ROOT / "svc.sh"), "start"])
        stage = "verify_online_primary"
        deadline = time.monotonic() + 45
        while time.monotonic() < deadline:
            inventory = api(endpoint + "/actions/runners?per_page=100")
            matches = [m for m in inventory.get("runners", []) if m.get("id") == configured.get("agentId") and m.get("name") == NAME]
            if inventory.get("total_count") == 1 and len(matches) == 1 and matches[0].get("status") == "online":
                labels = {label.get("name") for label in matches[0].get("labels", [])}
                if LABEL not in labels or "self-hosted" in labels:
                    raise CutoverBlocked("SCOPED_EXECUTION_LABEL_MISMATCH")
                report.update(ok=True, state="PRIMARY_ONLINE", registration_id=configured["agentId"], repository_id=PRIMARY_ID,
                              original_service_left_inactive=True, original_configuration_preserved=True)
                break
            time.sleep(3)
        if not report["ok"]:
            raise CutoverBlocked("PRIMARY_ONLINE_READBACK_NOT_VERIFIED")
    except Exception as error:
        report.update(state="BLOCKED", failure={"stage": stage, "code": str(error) if isinstance(error, CutoverBlocked) else "HOST_OR_PROVIDER_OPERATION_FAILED",
                                              "http_status": error.code if isinstance(error, urllib.error.HTTPError) else None})
        if isinstance(error, CutoverBlocked) and error.exit_code is not None:
            report["failure"]["exit_code"] = error.exit_code
        report["original_service_stopped"] = stopped
        report["automatic_store_fallback"] = False
    finally:
        if lock:
            lock.close()
    return report


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--install-opencode", action="store_true")
    arguments = parser.parse_args()
    if arguments.install_opencode and not arguments.apply:
        parser.error("--install-opencode requires --apply")
    token = os.environ.get("GH_ADDMINPROVIDER-FINE_GRAINED", "")
    if not token.startswith("github_pat_") or not re.fullmatch(r"[\x21-\x7e]+", token):
        print(json.dumps({"ok": False, "state": "CANONICAL_CREDENTIAL_REFERENCE_INVALID"}))
        return 1
    opener = urllib.request.build_opener(NoRedirect())

    def api(path, method="GET"):
        request = urllib.request.Request("https://api.github.com" + path, method=method, headers={"Authorization": "Bearer " + token,
            "Accept": "application/vnd.github+json", "User-Agent": "Unifiend-host-cutover", "X-GitHub-Api-Version": "2022-11-28"})
        with opener.open(request, timeout=20) as response:
            return json.load(response)

    profiles = None
    try:
        from unifiend_codex_plan import probe_account
        profiles = [probe_account("root", "/root"), probe_account("wave", "/home/wave")]
    except ImportError:
        pass
    result = perform_cutover(api, apply=arguments.apply)
    result["codex_profiles"] = profiles if profiles is not None else "INSPECTOR_NOT_LOADED"
    try:
        from unifiend_host_tools import inspect_tools, install_opencode
        result["host_tools"] = install_opencode() if result["ok"] and arguments.install_opencode else inspect_tools()
    except Exception:
        result["host_tools"] = {"state": "INSPECTOR_OR_INSTALL_UNAVAILABLE"}
    print(json.dumps(result))
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
