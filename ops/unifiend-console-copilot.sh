#!/usr/bin/env bash
# Existing root Console; inspect by default, explicit install-missing only.
set -euo pipefail
set +x
test "$(id -u)" = 0 || { echo EXISTING_ROOT_CONSOLE_REQUIRED; exit 1; }
INFISICAL_PROFILE=codex-terminal infisical run --projectId=e8cfba67-ea99-4d79-bc9f-87b862f9129c --env=staging --path=/ -- python3 - "$@" <<'UNIFIEND_COPILOT'
import base64, hashlib, json, os, pathlib, pwd, subprocess, sys, urllib.request
operation = sys.argv[1] if len(sys.argv) == 2 else 'inspect'
if operation not in ('inspect', 'install-missing'):
    raise SystemExit('SUPPORTED_OPERATIONS_INSPECT_OR_INSTALL_MISSING')
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None
try:
    units = subprocess.check_output(['systemctl', 'list-units', '--all', '--type=service', '--no-legend', '--plain', '--no-pager', 'actions.*'], text=True)
    users = set()
    for line in units.splitlines():
        unit = line.split()[0]
        user = subprocess.check_output(['systemctl', 'show', unit, '-p', 'User', '--value', '--no-pager'], text=True).strip()
        if user and user != 'root':
            users.add(user)
    if len(users) != 1:
        raise ValueError('EXISTING_SERVICE_ACCOUNT_NOT_RESOLVED')
    account = pwd.getpwnam(next(iter(users)))
    if not account.pw_uid:
        raise ValueError('UNPRIVILEGED_EXISTING_ACCOUNT_REQUIRED')
    if operation == 'install-missing':
        memory = dict(line.split(':', 1) for line in pathlib.Path('/proc/meminfo').read_text().splitlines())
        if int(memory['MemAvailable'].split()[0]) < 512 * 1024:
            raise ValueError('AVAILABLE_MEMORY_BELOW_INSTALL_THRESHOLD')
        if subprocess.run(['pgrep', '-f', '[R]unner.Worker'], stdout=subprocess.DEVNULL).returncode == 0:
            raise ValueError('EXISTING_WORK_ACTIVE_PRESERVED')
    token = os.environ['GH_ADDMINPROVIDER-FINE_GRAINED']
    opener = urllib.request.build_opener(NoRedirect())
    def request(url):
        query = urllib.request.Request(url, headers={'Authorization': 'Bearer ' + token, 'Accept': 'application/vnd.github+json'})
        with opener.open(query, timeout=20) as response:
            return json.load(response)
    if request('https://api.github.com/user').get('id') != 342175560:
        raise ValueError('OPERATIONAL_PRINCIPAL_MISMATCH')
    data = request('https://api.github.com/repos/Wave-Runner-2/Build-Platform/contents/scripts/unifiend-copilot-modes.py?ref=25c087018e6359082ba2178e05a3e5dc1f30e850')
    source = base64.b64decode(data['content'])
    if hashlib.sha256(source).hexdigest() != '8f5dda0723d3008fd807ecafd20548ee7e05ad960be790c3d14b36a87d48733e':
        raise ValueError('SOURCE_MISMATCH')
    path = account.pw_dir + '/.local/bin:' + account.pw_dir + '/.npm-global/bin:/usr/local/bin:/usr/bin:/bin'
    process = subprocess.run(['/usr/bin/sudo', '-n', '-H', '-u', account.pw_name, '/usr/bin/python3', '-', operation],
                             input=source, env={'PATH': path, 'LANG': 'C.UTF-8'})
    raise SystemExit(process.returncode)
except Exception as error:
    code = str(error) if isinstance(error, ValueError) else type(error).__name__
    print(json.dumps({'status': 'CONFIGURATION_REQUIRED', 'code': code, 'http_status': getattr(error, 'code', None)}))
    raise SystemExit(1)
UNIFIEND_COPILOT
