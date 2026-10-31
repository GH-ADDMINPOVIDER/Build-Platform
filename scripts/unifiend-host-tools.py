"""Inventory/install the requested OpenCode CLI using the existing service user."""
import json
import os
import pathlib
import pwd
import shutil
import subprocess

VERSION = '1.19.5'
NAMES = ('codex', 'infisical', 'opencode', 'copilot', 'code', 'tmux', 'node', 'npm')


def inspect_tools(home='/home/wave'):
    path = ':'.join([home + '/.local/bin', home + '/.npm-global/bin', '/usr/local/bin', '/usr/bin', '/bin'])
    result = {'tools': {name: bool(shutil.which(name, path=path)) for name in NAMES},
              'authentication': 'NOT_TESTED', 'models_run': False}
    try:
        memory = dict(line.split(':', 1) for line in pathlib.Path('/proc/meminfo').read_text().splitlines())
        result['memory_kib'] = {key: int(memory[key].split()[0]) for key in ('MemTotal', 'MemAvailable')}
    except (OSError, KeyError, ValueError):
        result['memory_kib'] = None
    return result


def install_opencode():
    result = inspect_tools()
    if result['tools']['opencode']:
        return {**result, 'install': 'EXISTING_PRESERVED'}
    if os.geteuid() != 0:
        raise RuntimeError('EXISTING_ROOT_CONSOLE_REQUIRED')
    account = pwd.getpwnam('wave')
    npm = shutil.which('npm', path='/usr/local/bin:/usr/bin:/bin')
    if not npm:
        raise RuntimeError('EXISTING_NPM_NOT_AVAILABLE')
    prefix = pathlib.Path(account.pw_dir) / '.local'
    if prefix.is_symlink():
        raise RuntimeError('INSTALL_PREFIX_SYMLINK_REJECTED')
    # Use the existing user, never global root installation or inherited vault keys.
    environment = {'PATH': '/usr/local/bin:/usr/bin:/bin', 'LANG': 'C.UTF-8'}
    command = ['/usr/bin/sudo', '-n', '-H', '-u', account.pw_name, npm, 'install', '--global', '--prefix', str(prefix), 'opencode-ai@' + VERSION]
    completed = subprocess.run(command, env=environment, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=180)
    if completed.returncode:
        return {'install': 'FAILED', 'exit_code': completed.returncode, 'credentials_changed': False}
    result = inspect_tools(account.pw_dir)
    executable = prefix / 'bin/opencode'
    version = subprocess.run(['/usr/bin/sudo', '-n', '-H', '-u', account.pw_name, str(executable), '--version'], env=environment,
                             stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=20)
    verified = version.returncode == 0 and version.stdout.decode().strip() == VERSION
    return {**result, 'install': 'INSTALLED_VERSION_VERIFIED' if verified else 'VERSION_NOT_VERIFIED', 'expected_version': VERSION,
            'credentials_changed': False, 'public_listener_started': False}

if __name__ == '__main__':
    print(json.dumps(inspect_tools()))
