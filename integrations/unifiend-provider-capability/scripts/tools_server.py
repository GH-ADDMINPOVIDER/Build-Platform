#!/usr/bin/env python3
"""Local stdio MCP: inspection and planning only. Python 3.9+, no dependencies."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parent.parent
VERSIONS = ("2025-06-18", "2025-03-26", "2024-11-05")
READY = False
INITIALIZED = False

def schema(properties=None, required=None):
    return {"type": "object", "properties": properties or {}, "required": required or [], "additionalProperties": False}

TOOLS = [
    {"name": "unifiend_capability_contract", "description": "Read historical non-secret contract; not a live verification.", "inputSchema": schema()},
    {"name": "unifiend_copilot_status", "description": "Inspect this machine's executable/help. No login or inference.", "inputSchema": schema()},
    {"name": "unifiend_ssh_status", "description": "Inspect this process's SSH agent. No key identities or server login.", "inputSchema": schema()},
    {"name": "unifiend_mode_plan", "description": "Return argv without execution. Requires UNIFIEND_WORKTREE.", "inputSchema": schema({"mode": {"type": "string", "enum": ["terminal", "prompt", "acp-stdio", "acp-tcp"]}, "cwd": {"type": "string"}, "port": {"type": "integer", "minimum": 1024, "maximum": 65535}, "prompt": {"type": "string", "minLength": 1, "maxLength": 12000}}, ["mode", "cwd"])},
]

def inspect(command):
    env = {k: os.environ[k] for k in ("PATH", "HOME", "LANG", "SSH_AUTH_SOCK", "NODE_EXTRA_CA_CERTS") if k in os.environ}
    try:
        return subprocess.run(command, capture_output=True, text=True, timeout=15, env=env)
    except (OSError, subprocess.TimeoutExpired):
        return None

def invoke(name, args):
    tool = next((t for t in TOOLS if t["name"] == name), None)
    if tool is None or not isinstance(args, dict):
        raise ValueError("UNKNOWN_TOOL_OR_INVALID_ARGUMENTS")
    if set(args) - set(tool["inputSchema"]["properties"]) or set(tool["inputSchema"]["required"]) - set(args):
        raise ValueError("INVALID_ARGUMENT_FIELDS")
    if name == "unifiend_capability_contract":
        return json.loads((ROOT / "references/provider-contract.json").read_text())
    if name == "unifiend_copilot_status":
        executable = shutil.which("copilot")
        result = inspect([executable, "--help"]) if executable else None
        help_text = result.stdout if result and result.returncode == 0 else ""
        return {"installed": bool(executable), "help_verified": bool(help_text), "acp_supported": "--acp" in help_text, "github_catalog_option": "--enable-all-github-mcp-tools" in help_text, "authentication": "NOT_TESTED", "quota": "NOT_TESTED", "inference": "NOT_RUN"}
    if name == "unifiend_ssh_status":
        result = inspect(["ssh-add", "-l"]) if os.environ.get("SSH_AUTH_SOCK") else None
        count = len(result.stdout.splitlines()) if result and result.returncode == 0 else 0
        return {"agent": "KEYS_LOADED" if count else "EMPTY" if result and result.returncode == 1 else "UNAVAILABLE", "key_count": count, "server_authentication": "NOT_TESTED"}
    mode, cwd = args["mode"], args["cwd"]
    if not isinstance(mode, str) or mode not in ("terminal", "prompt", "acp-stdio", "acp-tcp") or not isinstance(cwd, str) or not Path(cwd).is_absolute():
        raise ValueError("INVALID_MODE_OR_WORKTREE")
    base = os.environ.get("UNIFIEND_WORKTREE", "")
    if not base or not Path(base).is_absolute():
        raise ValueError("UNIFIEND_WORKTREE_REQUIRED")
    directory, allowed = Path(cwd).resolve(), Path(base).resolve()
    if not directory.is_dir() or not allowed.is_dir() or (directory != allowed and allowed not in directory.parents):
        raise ValueError("WORKTREE_OUTSIDE_AUTHORIZED_ROOT")
    if ("port" in args and mode != "acp-tcp") or ("prompt" in args and mode != "prompt"):
        raise ValueError("ARGUMENT_NOT_APPLICABLE_TO_MODE")
    argv = ["copilot", "--enable-all-github-mcp-tools"]
    if mode == "prompt":
        prompt = args.get("prompt")
        if not isinstance(prompt, str) or not 1 <= len(prompt.strip()) <= 12000:
            raise ValueError("PROMPT_REQUIRED")
        argv += ["-p", prompt]
    elif mode == "acp-stdio":
        argv += ["--acp", "--stdio"]
    elif mode == "acp-tcp":
        port = args.get("port", 3000)
        if type(port) is not int or not 1024 <= port <= 65535:
            raise ValueError("INVALID_PORT")
        argv += ["--acp", "--port", str(port)]
    return {"status": "PLAN_ONLY_NOT_EXECUTED", "cwd": str(directory), "argv": argv, "requires": ["installed compatible CLI", "authorized account/provider", "available quota", "native tool permission checks"]}

def dispatch(message):
    global READY, INITIALIZED
    if not isinstance(message, dict) or message.get("jsonrpc") != "2.0" or not isinstance(message.get("method"), str):
        raise ValueError("INVALID_REQUEST")
    method, params = message["method"], message.get("params", {})
    if not isinstance(params, dict):
        raise ValueError("INVALID_PARAMS")
    if method == "initialize":
        if not isinstance(params.get("protocolVersion"), str):
            raise ValueError("PROTOCOL_VERSION_REQUIRED")
        INITIALIZED = True
        version = params["protocolVersion"]
        return {"protocolVersion": version if version in VERSIONS else VERSIONS[0], "capabilities": {"tools": {}}, "serverInfo": {"name": "unifiend-capability", "version": "1.0.0"}}
    if method == "notifications/initialized":
        READY = INITIALIZED
        return None
    if method == "ping":
        return {}
    if not READY:
        raise ValueError("INITIALIZE_FIRST")
    if method == "tools/list":
        return {"tools": TOOLS}
    if method == "tools/call":
        try:
            result = invoke(params.get("name"), params.get("arguments", {}))
            return {"content": [{"type": "text", "text": json.dumps(result)}], "isError": False}
        except ValueError as error:
            return {"content": [{"type": "text", "text": str(error)}], "isError": True}
    raise ValueError("METHOD_NOT_SUPPORTED")

def main():
    if sys.argv[1:] == ["--print-config"]:
        print(json.dumps({"mcpServers": {"unifiend-capability": {"command": sys.executable, "args": [str(Path(__file__).resolve())]}}}, indent=2))
        return
    if sys.argv[1:]:
        raise SystemExit("Use --print-config or no arguments for stdio MCP")
    for line in sys.stdin:
        message = None
        try:
            message = json.loads(line)
            result = dispatch(message)
            if "id" not in message:
                continue
            response = {"jsonrpc": "2.0", "id": message["id"], "result": result}
        except Exception:
            if isinstance(message, dict) and "id" not in message:
                continue
            response = {"jsonrpc": "2.0", "id": message.get("id") if isinstance(message, dict) else None, "error": {"code": -32600, "message": "Invalid or unsupported request"}}
        print(json.dumps(response), flush=True)

if __name__ == "__main__":
    main()
