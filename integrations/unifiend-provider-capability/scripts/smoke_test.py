#!/usr/bin/env python3
"""Real stdio protocol smoke, using local CLI/agent fixtures; no inference/SSH."""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile

SERVER = Path(__file__).with_name("tools_server.py")

def main():
    with tempfile.TemporaryDirectory() as temporary:
        root = Path(temporary)
        work = root / "work"
        work.mkdir()
        (work / "escape").symlink_to(root, target_is_directory=True)
        for name, output in (("copilot", "--acp --enable-all-github-mcp-tools"), ("ssh-add", "256 SHA256:fixture fixture-comment (ED25519)")):
            path = root / name
            path.write_text("#!/bin/sh\n[ -z \"${UNIFIEND_FIXTURE_SECRET:-}\" ] || exit 91\nprintf '%s\\n' '" + output + "'\n")
            path.chmod(0o700)
        env = dict(os.environ, UNIFIEND_WORKTREE=str(work), PATH=str(root) + os.pathsep + os.defpath,
                   SSH_AUTH_SOCK=str(root / "fake-agent"), UNIFIEND_FIXTURE_SECRET="must-not-be-forwarded")
        messages = []
        def request(method, params=None):
            identifier = len(messages) + 1
            messages.append({"jsonrpc": "2.0", "id": identifier, "method": method, "params": params or {}})
            return identifier
        def call(name, args=None):
            return request("tools/call", {"name": name, "arguments": args or {}})
        before = request("tools/list")
        initialized = request("initialize", {"protocolVersion": "2025-06-18", "clientInfo": {"name": "smoke", "version": "1"}, "capabilities": {}})
        messages.append({"jsonrpc": "2.0", "method": "notifications/initialized"})
        listing = request("tools/list")
        contract = call("unifiend_capability_contract")
        copilot = call("unifiend_copilot_status")
        agent = call("unifiend_ssh_status")
        modes = [call("unifiend_mode_plan", dict(mode=mode, cwd=str(work), **extra)) for mode, extra in (
            ("terminal", {}), ("prompt", {"prompt": "test; $(not-executed)"}), ("acp-stdio", {}), ("acp-tcp", {"port": 3001}))]
        failures = [call("unifiend_mode_plan", args) for args in (
            {"mode": "terminal", "cwd": str(root)},
            {"mode": "terminal", "cwd": str(work / "escape")},
            {"mode": "acp-tcp", "cwd": str(work), "port": True},
            {"mode": "prompt", "cwd": str(work), "prompt": " "},
            {"mode": "terminal", "cwd": str(work), "unexpected": "value"})]
        unknown = call("unknown")
        wire = "\n".join(json.dumps(m) for m in messages) + '\nnot-json\n{"jsonrpc":"2.0","id":999,"method":"ping"}\n'
        run = subprocess.run([sys.executable, str(SERVER)], input=wire, text=True, capture_output=True, env=env, timeout=20, check=True)
        results = {r["id"]: r for r in map(json.loads, run.stdout.splitlines())}
        def result(identifier):
            return results[identifier]["result"]
        def content(identifier):
            return json.loads(result(identifier)["content"][0]["text"])
        assert "error" in results[before]
        assert result(initialized)["protocolVersion"] == "2025-06-18"
        assert len(result(listing)["tools"]) == 4
        assert content(contract)["snapshot_only"] is True
        assert content(copilot)["acp_supported"] and content(copilot)["github_catalog_option"]
        assert content(agent)["key_count"] == 1
        assert all(content(i)["status"] == "PLAN_ONLY_NOT_EXECUTED" for i in modes)
        assert content(modes[1])["argv"][-1] == "test; $(not-executed)"
        assert content(modes[2])["argv"][-2:] == ["--acp", "--stdio"]
        assert content(modes[3])["argv"][-2:] == ["--port", "3001"]
        assert all(result(i)["isError"] for i in failures + [unknown])
        assert "error" in results[None] and result(999) == {}
        assert "fixture-comment" not in run.stdout and "must-not-be-forwarded" not in run.stdout
        config = json.loads(subprocess.check_output([sys.executable, str(SERVER), "--print-config"], text=True))
        assert Path(config["mcpServers"]["unifiend-capability"]["args"][0]).is_absolute()
        helper = SERVER.with_name("ssh-unlock.sh")
        assert subprocess.run(["bash", str(helper)], capture_output=True).returncode == 2
        assert subprocess.run(["bash", "-c", 'source "$1" /nonexistent/unifiend-key 1h', "smoke", str(helper)], capture_output=True).returncode == 2
        print(json.dumps({"smoke": "PASS", "assertion_groups": 16, "cli_agent": "LOCAL_FIXTURES", "model_calls": 0, "ssh_connections": 0, "disk_key_changes": 0}))

if __name__ == "__main__":
    main()
