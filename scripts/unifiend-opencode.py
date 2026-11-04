"""Opt-in OpenCode terminal on the existing host; never selects Codex auth."""
import argparse
import fcntl
import json
import os
import pathlib
import shutil
import subprocess

ROOT = pathlib.Path(__file__).resolve().parents[1]
PINNED_VERSION = '1.19.5'
SAFE_ENV = ('PATH', 'HOME', 'USER', 'LOGNAME', 'SHELL', 'LANG', 'LC_ALL', 'TERM', 'COLORTERM', 'TMPDIR', 'SSL_CERT_FILE', 'SSL_CERT_DIR')


def child_environment(source, model, mode):
    if not model.startswith('deepseek/') or not model.removeprefix('deepseek/') or any(c.isspace() for c in model):
        raise ValueError('EXPLICIT_DEEPSEEK_MODEL_REQUIRED')
    key = source.get('DEEPSEEK_API_KEY', '')
    if not key:
        raise ValueError('EXISTING_DEEPSEEK_API_KEY_REFERENCE_REQUIRED')
    env = {name: source[name] for name in SAFE_ENV if name in source}
    env['DEEPSEEK_API_KEY'] = key
    env['COLORTERM'] = 'truecolor'
    env['OPENCODE_TUI_CONFIG'] = str(ROOT / 'config/unifiend-opencode-tui.json')
    env['OPENCODE_CONFIG_CONTENT'] = json.dumps({
        '$schema': 'https://opencode.ai/config.json',
        'model': model, 'enabled_providers': ['deepseek'], 'autoupdate': False,
        'share': 'disabled', 'lsp': False, 'permission': {'edit': 'ask', 'bash': 'ask'},
        'provider': {'deepseek': {'options': {'apiKey': '{env:DEEPSEEK_API_KEY}'}}},
    })
    if mode == 'serve':
        password = source.get('OPENCODE_SERVER_PASSWORD', '')
        if not password:
            raise ValueError('EXISTING_OPENCODE_SERVER_PASSWORD_REFERENCE_REQUIRED')
        env['OPENCODE_SERVER_PASSWORD'] = password
    return env


def run(mode, model, source=os.environ):
    executable = shutil.which('opencode', path=source.get('PATH'))
    if mode == 'status':
        return {'installed': bool(executable), 'authentication': 'NOT_TESTED',
                'inference_performed': False, 'codex_profiles_changed': False}
    if not executable:
        raise ValueError('OPENCODE_NOT_INSTALLED')
    if os.geteuid() == 0:
        raise ValueError('USE_EXISTING_UNPRIVILEGED_SERVICE_ACCOUNT')
    branch = subprocess.run(['git', 'branch', '--show-current'], cwd=ROOT, capture_output=True, text=True, check=True).stdout.strip()
    if branch != 'Unified-on-Progress':
        raise ValueError('WORK_BRANCH_REQUIRED')
    environment = child_environment(source, model, mode)
    home = pathlib.Path(source['HOME'])
    # Share the existing Terminal Solo lock with the approved Codex consumer.
    lock_path = home / '.ogenic-unifiend-terminal-solo.lock'
    descriptor = os.open(lock_path, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    with os.fdopen(descriptor, 'a') as lock:
        os.fchmod(lock.fileno(), 0o600)
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise ValueError('TERMINAL_SOLO_BUSY')
        args = [executable] if mode == 'tui' else [executable, 'serve', '--hostname', '127.0.0.1', '--port', '4096']
        # No credential is placed in argv, a config file or stdout.
        return {'exit_code': subprocess.call(args, cwd=ROOT, env=environment), 'codex_profiles_changed': False}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('mode', choices=['status', 'tui', 'serve'], nargs='?', default='status')
    parser.add_argument('--model', default='')
    arguments = parser.parse_args()
    try:
        result = run(arguments.mode, arguments.model)
    except ValueError as error:
        print(json.dumps({'ok': False, 'code': str(error)}))
        return 1
    except Exception:
        print(json.dumps({'ok': False, 'code': 'OPENCODE_START_FAILED'}))
        return 1
    print(json.dumps(result))
    return result.get('exit_code', 0)

if __name__ == '__main__':
    raise SystemExit(main())
