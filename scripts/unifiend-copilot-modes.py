"""Prepare Copilot modes without changing existing profiles or starting services."""
import argparse
import http.server
import json
import os
import pathlib
import selectors
import signal
import shutil
import socket
import subprocess
import tempfile
import threading
import time

VERSION = '1.0.106-2'
PACKAGE = '@github/copilot@' + VERSION
MODES = ('terminal', 'prompt', 'acp-stdio', 'acp-tcp')
FLAGS = ('--acp', '--stdio', '--port', '--enable-all-github-mcp-tools')


def clean_environment(home):
    """Installation and transport probes receive no broker/provider credentials."""
    result = {key: os.environ[key] for key in (
        'PATH', 'LANG', 'HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy',
        'NO_PROXY', 'no_proxy', 'NODE_EXTRA_CA_CERTS', 'SSL_CERT_FILE'
    ) if key in os.environ}
    result['HOME'] = str(home)
    return result


def managed_executable(home):
    return pathlib.Path(home) / '.local/share/unifiend/copilot' / VERSION / 'node_modules/.bin/copilot'


def resolve_executable(home):
    managed = managed_executable(home)
    if managed.is_file():
        return str(managed)
    path = str(pathlib.Path(home) / '.local/bin') + os.pathsep + os.environ.get('PATH', '')
    return shutil.which('copilot', path=path)


def command(executable, mode, cwd, port=3000, prompt=None):
    if mode not in MODES:
        raise ValueError('UNSUPPORTED_MODE')
    if not pathlib.Path(cwd).is_dir():
        raise ValueError('WORK_DIRECTORY_REQUIRED')
    args = [str(executable), '--enable-all-github-mcp-tools']
    if mode == 'prompt':
        if not prompt:
            raise ValueError('PROMPT_REQUIRED')
        args += ['-p', prompt]
    elif mode == 'acp-stdio':
        args += ['--acp']  # stdio is the default, including older ACP builds.
    elif mode == 'acp-tcp':
        if not 1024 <= port <= 65535:
            raise ValueError('UNPRIVILEGED_PORT_REQUIRED')
        args += ['--acp', '--port', str(port)]
    return args


def install_missing(home):
    if resolve_executable(home):
        return 'EXISTING_PRESERVED'
    if os.geteuid() == 0:
        raise ValueError('USE_EXISTING_UNPRIVILEGED_SERVICE_ACCOUNT')
    node, npm = shutil.which('node'), shutil.which('npm')
    if not node or not npm:
        raise ValueError('NODE_22_AND_NPM_REQUIRED')
    env = clean_environment(home)
    version = subprocess.run([node, '--version'], env=env, capture_output=True, text=True, timeout=10)
    if version.returncode or int(version.stdout.strip().lstrip('v').split('.')[0]) < 22:
        raise ValueError('NODE_22_AND_NPM_REQUIRED')
    prefix = managed_executable(home).parents[2]
    # Fail rather than follow a pre-existing redirected managed install location.
    if any(p.is_symlink() for p in [prefix, *prefix.parents] if p != pathlib.Path('/')):
        raise ValueError('MANAGED_PREFIX_SYMLINK_REJECTED')
    prefix.mkdir(parents=True, exist_ok=True, mode=0o700)
    process = subprocess.run([npm, 'install', '--prefix', str(prefix), '--no-audit', '--no-fund', PACKAGE],
                             env=env, capture_output=True, timeout=240)
    return 'INSTALLED' if process.returncode == 0 else 'INSTALL_FAILED'


def inspect(home):
    executable = resolve_executable(home)
    result = {'schema': 'UNIFIEND_COPILOT_MODES_V1', 'provider': 'GH-ADDMINPOVIDER',
              'host': 'Ocian-S-Host', 'installed': bool(executable),
              'authentication': 'NOT_TESTED', 'quota': 'NOT_TESTED', 'inference': 'NOT_RUN',
              'autostart': False, 'github_tool_catalog': 'FULL_REQUESTED_PER_LAUNCH',
              'permission_policy': 'EXISTING_OWNER_SCOPE_AND_NATIVE_TOOL_PERMISSIONS',
              'modes': {mode: 'NOT_VERIFIED' for mode in MODES}}
    if not executable:
        return result
    try:
        completed = subprocess.run([executable, '--help'], env=clean_environment(home),
                                   capture_output=True, text=True, timeout=25)
        help_text = completed.stdout + completed.stderr
        result['flags'] = {flag: flag in help_text for flag in FLAGS}
        result['modes']['terminal'] = 'CLI_PRESENT' if completed.returncode == 0 else 'HELP_FAILED'
        result['modes']['prompt'] = 'FLAG_PRESENT' if '-p,' in help_text or '--prompt' in help_text else 'UNSUPPORTED'
        result['modes']['acp-stdio'] = 'ACP_PRESENT_HANDSHAKE_REQUIRED' if result['flags']['--acp'] else 'UNSUPPORTED'
        result['modes']['acp-tcp'] = 'HANDSHAKE_REQUIRED_GLOBAL_HELP_NOT_AUTHORITATIVE'
    except (OSError, subprocess.TimeoutExpired):
        result['inspection'] = 'READ_UNAVAILABLE'
    return result


def smoke_transport(executable, mode, home, timeout=30):
    """Only ACP initialize, with no session/new, prompt, tools or model calls."""
    if mode not in ('acp-stdio', 'acp-tcp'):
        raise ValueError('TRANSPORT_MODE_REQUIRED')
    port = 3000
    if mode == 'acp-tcp':
        with socket.socket() as reservation:
            reservation.bind(('127.0.0.1', 0))
            port = reservation.getsockname()[1]
    args = command(executable, mode, home, port)
    args.append('--disable-builtin-mcps')
    isolated = tempfile.TemporaryDirectory(prefix='unifiend-copilot-smoke-')
    env = clean_environment(isolated.name)
    # Isolate CLI state from existing profiles and block incidental GitHub auth.
    env['COPILOT_HOME'] = str(pathlib.Path(isolated.name) / 'config')
    env['COPILOT_OFFLINE'] = 'true'
    # A synthetic loopback provider permits startup without a real account.
    # It may answer model metadata, but rejects and counts every inference attempt.
    calls = {'inference': 0}
    class MetadataOnly(http.server.BaseHTTPRequestHandler):
        def log_message(self, *_args):
            pass

        def do_GET(self):
            body = json.dumps({'object': 'list', 'data': [{'id': 'unifiend-transport-fixture', 'object': 'model', 'owned_by': 'fixture'}]}).encode()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(body)

        def do_POST(self):
            calls['inference'] += 1
            self.send_response(403)
            self.end_headers()

    provider = http.server.ThreadingHTTPServer(('127.0.0.1', 0), MetadataOnly)
    thread = threading.Thread(target=provider.serve_forever, daemon=True)
    thread.start()
    env['COPILOT_PROVIDER_BASE_URL'] = 'http://127.0.0.1:' + str(provider.server_port) + '/v1'
    env['COPILOT_PROVIDER_API_KEY'] = 'fixture'
    env['COPILOT_PROVIDER_TYPE'] = 'openai'
    env['COPILOT_PROVIDER_MODEL'] = 'unifiend-transport-fixture'
    args += ['--model', 'unifiend-transport-fixture']
    child = subprocess.Popen(args, cwd=home, env=env, stdin=subprocess.PIPE,
                             stdout=subprocess.PIPE, stderr=subprocess.PIPE, start_new_session=True)
    channel = None
    selector = selectors.DefaultSelector()
    deadline = time.monotonic() + timeout
    state = 'INITIALIZE_UNAVAILABLE'
    errors = b''
    pending = b''
    try:
        if mode == 'acp-tcp':
            while time.monotonic() < deadline and child.poll() is None:
                try:
                    channel = socket.create_connection(('127.0.0.1', port), timeout=0.2)
                    break
                except OSError:
                    time.sleep(0.05)
            if channel is None:
                raise RuntimeError('LISTENER_UNAVAILABLE')
            reader = channel.makefile('rb')
        else:
            reader = child.stdout
        request = json.dumps({'jsonrpc': '2.0', 'id': 1, 'method': 'initialize', 'params': {
            'protocolVersion': 1, 'clientCapabilities': {},
            'clientInfo': {'name': 'Unifiend-transport-smoke', 'version': '1'}}}).encode() + bytes([10])
        if channel:
            channel.sendall(request)
        else:
            child.stdin.write(request)
            child.stdin.flush()
        selector.register(reader, selectors.EVENT_READ)
        while time.monotonic() < deadline:
            if not selector.select(timeout=max(0, deadline - time.monotonic())):
                break
            chunk = os.read(reader.fileno(), 65536)
            if not chunk:
                break
            pending += chunk
            if len(pending) > 262144:
                state = 'INITIALIZE_REJECTED'
                break
            while bytes([10]) in pending:
                line, pending = pending.split(bytes([10]), 1)
                try:
                    message = json.loads(line)
                except (ValueError, UnicodeError):
                    continue
                if message.get('id') == 1:
                    result = message.get('result')
                    state = 'INITIALIZE_VERIFIED_NO_INFERENCE' if isinstance(result, dict) and result.get('protocolVersion') == 1 else 'INITIALIZE_REJECTED'
                    break
            if state != 'INITIALIZE_UNAVAILABLE':
                break
    except RuntimeError:
        state = 'LISTENER_UNAVAILABLE'
    finally:
        selector.close()
        if channel:
            channel.close()
        if child.poll() is None:
            os.killpg(child.pid, signal.SIGTERM)
        try:
            _, errors = child.communicate(timeout=3)
        except subprocess.TimeoutExpired:
            os.killpg(child.pid, signal.SIGKILL)
            _, errors = child.communicate(timeout=3)
        isolated.cleanup()
        provider.shutdown()
        provider.server_close()
        thread.join(timeout=1)
    lowered = errors.decode(errors='replace').lower()
    diagnostic = 'NONE' if state == 'INITIALIZE_VERIFIED_NO_INFERENCE' else 'UNCLASSIFIED'
    for marker, category in (('unknown option', 'CLI_OPTION_UNSUPPORTED'),
                             ('unrecognized', 'CLI_OPTION_UNSUPPORTED'),
                             ('authentication', 'AUTHENTICATION_REQUIRED'),
                             ('sign in', 'AUTHENTICATION_REQUIRED'),
                             ('provider', 'PROVIDER_CONFIGURATION_REQUIRED')):
        if marker in lowered:
            diagnostic = category
            break
    if calls['inference']:
        state, diagnostic = 'INITIALIZE_REJECTED', 'MODEL_CALL_NOT_PERMITTED_IN_TRANSPORT_SMOKE'
    return {'state': state, 'diagnostic': diagnostic, 'provider': 'SYNTHETIC_LOOPBACK_ONLY',
            'inference_requests': calls['inference'], 'real_authentication': 'NOT_TESTED'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('operation', choices=('inspect', 'install-missing', 'smoke', 'launch'))
    parser.add_argument('--mode', choices=MODES, default='acp-stdio')
    parser.add_argument('--cwd', default=os.getcwd())
    parser.add_argument('--port', type=int, default=3000)
    parser.add_argument('--prompt')
    args = parser.parse_args()
    home = pathlib.Path.home()
    if args.operation == 'launch':
        executable = resolve_executable(home)
        if not executable:
            raise ValueError('COPILOT_NOT_INSTALLED')
        state = inspect(home)
        if not state.get('flags', {}).get('--enable-all-github-mcp-tools'):
            raise ValueError('INSTALLED_CLI_FULL_CATALOG_FLAG_UNSUPPORTED')
        argv = command(executable, args.mode, args.cwd, args.port, args.prompt)
        os.chdir(args.cwd)
        # Preserve existing selected-user auth. Never inject or substitute another provider here.
        env = clean_environment(home)
        for name in ('COPILOT_HOME', 'COPILOT_GITHUB_TOKEN', 'GH_TOKEN', 'GITHUB_TOKEN',
                     'COPILOT_PROVIDER_BASE_URL', 'COPILOT_PROVIDER_API_KEY',
                     'COPILOT_PROVIDER_TYPE', 'COPILOT_PROVIDER_MODEL', 'COPILOT_PROVIDERS_CONFIG'):
            if name in os.environ:
                env[name] = os.environ[name]
        os.execve(executable, argv, env)
    result = inspect(home)
    if args.operation == 'install-missing':
        outcome = install_missing(home)
        result = inspect(home)
        result['installation'] = outcome
    elif args.operation == 'smoke':
        executable = resolve_executable(home)
        result['transport_smoke'] = smoke_transport(executable, args.mode, home) if executable else 'COPILOT_NOT_INSTALLED'
    print(json.dumps(result))
    transport = result.get('transport_smoke')
    if result.get('installation') == 'INSTALL_FAILED' or (transport and (not isinstance(transport, dict) or transport.get('state') != 'INITIALIZE_VERIFIED_NO_INFERENCE')):
        raise SystemExit(1)


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, subprocess.TimeoutExpired) as error:
        code = str(error) if isinstance(error, ValueError) else type(error).__name__
        print(json.dumps({'schema': 'UNIFIEND_COPILOT_MODES_V1', 'status': 'CONFIGURATION_REQUIRED', 'code': code}))
        raise SystemExit(1)
