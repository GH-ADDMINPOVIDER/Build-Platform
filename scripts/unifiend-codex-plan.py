"""Read account/allowance through the installed Codex protocol; no inference."""
import json
import hashlib
import math
import os
import pathlib
import selectors
import shutil
import subprocess
import time


def public_plan(account, limits):
    account = account if isinstance(account, dict) else {}
    result = {"auth_mode": account.get("type") if account.get("type") in ("chatgpt", "apiKey") else "UNVERIFIED"}
    plan = account.get("planType")
    allowed = {"free", "go", "plus", "pro", "team", "business", "enterprise", "edu", "healthcare", "pro100", "pro200", "pro500"}
    result["plan_type"] = plan if plan in allowed else "UNREPORTED"
    email = account.get("email")
    result["matches_pinned_gs"] = (hashlib.sha256(email.strip().lower().encode()).hexdigest() ==
        "8bbd06e2d6ece81d6aa072621f55c87ccdac79f6108bf7f42b75eb4596aa3f53") if isinstance(email, str) and email.strip() else None
    if isinstance(limits, dict):
        snapshot = limits.get("rateLimits")
        snapshot = snapshot if isinstance(snapshot, dict) else {}
        if snapshot.get("planType") in allowed:
            result["plan_type"] = snapshot["planType"]
        result["allowance"] = {}
        for slot in ("primary", "secondary"):
            value = snapshot.get(slot)
            if not isinstance(value, dict):
                continue
            fields = {}
            for key in ("usedPercent", "windowDurationMins", "resetsAt"):
                number = value.get(key)
                if type(number) in (int, float) and math.isfinite(number) and number >= 0:
                    fields[key] = number
            result["allowance"][slot] = fields
    return result


def probe_account(account, home, timeout=25):
    report = {"profile_user": account, "state": "READ_UNAVAILABLE", "inference_performed": False}
    path = os.pathsep.join([str(pathlib.Path(home) / ".local/bin"), str(pathlib.Path(home) / ".npm-global/bin"), "/usr/local/bin", "/usr/bin", "/bin"])
    executable = shutil.which("codex", path=path)
    if not executable:
        return {**report, "reason": "CODEX_NOT_IN_PATH"}
    environment = {"PATH": path, "HOME": home, "USER": account, "LOGNAME": account, "LANG": "C.UTF-8", "CODEX_HOME": str(pathlib.Path(home) / ".codex")}
    process = None
    selector = selectors.DefaultSelector()
    try:
        # Only this minimal environment reaches Codex. The broker's provider
        # keys and API keys are not inherited and no auth file is copied/read.
        process = subprocess.Popen(["/usr/bin/sudo", "-n", "-E", "-H", "-u", account, executable, "app-server"],
                                   env=environment, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
        selector.register(process.stdout, selectors.EVENT_READ)
        buffer = b""
        deadline = time.monotonic() + timeout

        def send(message):
            process.stdin.write(json.dumps(message).encode() + b"\n")
            process.stdin.flush()

        def receive(request_id):
            nonlocal buffer
            while time.monotonic() < deadline:
                while b"\n" in buffer:
                    line, buffer = buffer.split(b"\n", 1)
                    try:
                        value = json.loads(line)
                    except (ValueError, UnicodeError):
                        continue
                    if value.get("id") == request_id:
                        if "error" in value:
                            raise RuntimeError("PROTOCOL_READ_REJECTED")
                        return value.get("result") or {}
                events = selector.select(max(0, deadline - time.monotonic()))
                if not events:
                    break
                chunk = os.read(process.stdout.fileno(), 65536)
                if not chunk:
                    raise RuntimeError("PROTOCOL_CLOSED")
                buffer += chunk
                if len(buffer) > 1024 * 1024:
                    raise RuntimeError("RESPONSE_LIMIT")
            raise RuntimeError("PROTOCOL_TIMEOUT")

        send({"id": 1, "method": "initialize", "params": {"clientInfo": {"name": "unifiend-capability", "version": "1.0.0"}}})
        receive(1)
        send({"method": "initialized"})
        send({"id": 2, "method": "account/read", "params": {"refreshToken": False}})
        identity = receive(2)
        report.update(public_plan(identity.get("account"), None))
        report["state"] = "ACCOUNT_READ"
        send({"id": 3, "method": "account/rateLimits/read", "params": {}})
        report.update(public_plan(identity.get("account"), receive(3)))
        report["state"] = "ACCOUNT_AND_LIMITS_READ"
    except Exception as error:
        known = {"PROTOCOL_READ_REJECTED", "PROTOCOL_CLOSED", "PROTOCOL_TIMEOUT", "RESPONSE_LIMIT"}
        report["reason"] = str(error) if str(error) in known else "CLIENT_READ_FAILED"
    finally:
        selector.close()
        if process:
            try:
                process.stdin.close()
                process.wait(timeout=3)
            except Exception:
                process.terminate()
                try:
                    process.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait()
            if process.stdout:
                process.stdout.close()
    return report
