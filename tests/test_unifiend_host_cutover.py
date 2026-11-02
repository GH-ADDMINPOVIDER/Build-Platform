import base64
import datetime
import hashlib
import importlib.util
import json
import pathlib
import subprocess
import tempfile
import types
import unittest
import urllib.error
from unittest.mock import patch

SCRIPTS = pathlib.Path(__file__).parents[1] / 'scripts'
def module(name, file):
    spec = importlib.util.spec_from_file_location(name, SCRIPTS / file)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result
cut = module('cutover', 'unifiend-host-cutover.py')
plan = module('plan', 'unifiend-codex-plan.py')
REPO = {'id': cut.PRIMARY_ID, 'owner': {'id': cut.PRINCIPAL_ID}, 'full_name': 'canonical/target', 'html_url': 'https://github.com/canonical/target'}
OLD = {'gitHubUrl': 'https://github.com/retired-fixture/Build-Platform', 'agentId': 21, 'agentName': 'historical-host'}
cut.OLD_URL_SHA256 = hashlib.sha256(OLD['gitHubUrl'].encode('utf-8')).hexdigest()

class PreflightTests(unittest.TestCase):
    def test_exact_old_installation_can_move(self):
        self.assertEqual(cut.validate_preflight(OLD, REPO, [], cut.PIN, False), 'REUSE_EXISTING_INSTALLATION')

    def test_wrong_identity_host_busy_or_collision_preserve_existing_work(self):
        cases = [({**OLD, 'agentId': 20}, REPO, [], cut.PIN, False),
                 (OLD, {**REPO, 'id': 1}, [], cut.PIN, False),
                 (OLD, REPO, [], 'untrusted', False),
                 (OLD, REPO, [], cut.PIN, True),
                 (OLD, REPO, [{'id': 9}], cut.PIN, False)]
        for args in cases:
            with self.subTest(args=args), self.assertRaises(cut.CutoverBlocked):
                cut.validate_preflight(*args)

    def test_already_primary_is_idempotent_but_duplicates_are_rejected(self):
        config = {'gitHubUrl': REPO['html_url'], 'agentId': 9, 'agentName': cut.NAME}
        machine = {'id': 9, 'name': cut.NAME}
        self.assertEqual(cut.validate_preflight(config, REPO, [machine], cut.PIN, False), 'PRIMARY_ALREADY_BOUND')
        with self.assertRaises(cut.CutoverBlocked):
            cut.validate_preflight(config, REPO, [machine, machine], cut.PIN, False)

class CutoverTests(unittest.TestCase):
    def exercise(self, *, apply=True, denial=False, busy=False, collision=False, configure_error=False):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            recovery = root / '.unifiend-cutover'
            host = root / 'host.pub'
            public_bytes = b'public-test-key'
            host.write_text('ssh-ed25519 ' + base64.b64encode(public_bytes).decode())
            pin = 'SHA256:' + base64.b64encode(hashlib.sha256(public_bytes).digest()).decode().rstrip('=')
            (root / '.runner').write_text(json.dumps(OLD), encoding='utf-8-sig')
            (root / '.credentials').write_text('synthetic-private-registration')
            (root / '.service').write_text('actions.original.service')
            (root / 'svc.sh').write_text('original-script')
            if collision:
                recovery.mkdir()
                (recovery / '.runner').write_text('preserved-state')
            commands, requests = [], []
            registered = False
            def api(path, method='GET'):
                nonlocal registered
                requests.append((path, method))
                if path == '/user': return {'id': cut.PRINCIPAL_ID}
                if path.startswith('/repositories/'): return REPO
                if method == 'POST':
                    if denial: raise urllib.error.HTTPError('https://api.github.com/fixed', 403, 'denied', {}, None)
                    return {'token': 'synthetic-short-lived-registration', 'expires_at': (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=1)).isoformat()}
                if registered:
                    return {'total_count': 1, 'runners': [{'id': 99, 'name': cut.NAME, 'status': 'online', 'labels': [{'name': cut.LABEL}]}]}
                return {'total_count': 0, 'runners': []}
            def run(args, **kwargs):
                nonlocal registered
                commands.append((args, kwargs['env']))
                self.assertNotIn('synthetic-short-lived-registration', str(args))
                if 'show' in args:
                    out = 'User=wave\nExecStart={ path=' + str(root / 'runsvc.sh') + ' ; argv[]=private-unused ; }\n'
                    return subprocess.CompletedProcess(args, 0, out.encode(), b'')
                if str(root / 'config.sh') in args:
                    self.assertEqual(kwargs['env']['ACTIONS_RUNNER_INPUT_TOKEN'], 'synthetic-short-lived-registration')
                    self.assertEqual((recovery / '.credentials').read_text(), 'synthetic-private-registration')
                    self.assertFalse((root / '.credentials').exists())
                    if configure_error: return subprocess.CompletedProcess(args, 7, b'private-output', b'private-error')
                    (root / '.runner').write_text(json.dumps({'gitHubUrl': REPO['html_url'], 'agentId': 99, 'agentName': cut.NAME}))
                    (root / 'svc.sh').write_text('new-service-script')
                    registered = True
                if 'uninstall' in args: (root / '.service').unlink()
                if 'install' in args: (root / '.service').write_text('actions.primary.service')
                return subprocess.CompletedProcess(args, 0, b'', b'')
            account = types.SimpleNamespace(pw_name='wave')
            with patch.multiple(cut, ROOT=root, RECOVERY=recovery, HOST_PUBLIC_KEY=host, PIN=pin), patch.object(cut.os, 'geteuid', return_value=0), patch.object(cut.pwd, 'getpwnam', return_value=account), patch.object(cut, 'worker_active', return_value=busy), patch.object(cut.subprocess, 'run', side_effect=run):
                result = cut.perform_cutover(api, apply=apply)
            for marker in ('synthetic-private-registration', 'synthetic-short-lived-registration', 'private-error', 'private-unused'):
                self.assertNotIn(marker, json.dumps(result))
            self.assertTrue(all(path.startswith('/repos/canonical/target/') or method == 'GET' for path, method in requests))
            return result, commands, requests

    def test_dry_run_has_no_provider_or_service_mutation(self):
        result, commands, requests = self.exercise(apply=False)
        self.assertEqual(result['state'], 'PLAN_READY')
        self.assertTrue(all(method == 'GET' for _, method in requests))
        self.assertTrue(all('show' in args for args, _ in commands))

    def test_permission_denial_happens_before_stopping_service(self):
        result, commands, _ = self.exercise(denial=True)
        self.assertEqual(result['failure']['http_status'], 403)
        self.assertFalse(result['original_service_stopped'])
        self.assertFalse(any('stop' in args for args, _ in commands))

    def test_busy_and_recovery_collision_do_not_stop_service(self):
        for args in ({'busy': True}, {'collision': True}):
            result, commands, _ = self.exercise(**args)
            self.assertFalse(result['original_service_stopped'])
            self.assertFalse(any('stop' in cmd for cmd, _ in commands))

    def test_actual_sequence_preserves_config_and_uses_existing_installation(self):
        result, commands, _ = self.exercise()
        self.assertTrue(result['ok'])
        self.assertEqual(result['state'], 'PRIMARY_ONLINE')
        self.assertFalse(result['archived_provider_write'])
        self.assertFalse(result['codex_profiles_changed'])
        config_args = next(args for args, _ in commands if '--unattended' in args)
        self.assertIn('--no-default-labels', config_args)
        self.assertEqual(config_args[config_args.index('--name') + 1], 'GH-ADDMINPOVIDER')
        self.assertEqual(config_args[config_args.index('--labels') + 1], 'GH-ADDMINPOVIDER')
        self.assertEqual(result['host'], 'Ocian-S-Host')
        self.assertIn('_work-unifiend', config_args)
        self.assertFalse(any('curl' in str(args) or 'ssh-keygen' in str(args) for args, _ in commands))

    def test_failed_configuration_does_not_restart_archive_or_emit_private_output(self):
        result, commands, _ = self.exercise(configure_error=True)
        self.assertFalse(result['ok'])
        self.assertEqual(result['failure']['exit_code'], 7)
        self.assertTrue(result['original_service_stopped'])
        self.assertFalse(result['automatic_store_fallback'])
        self.assertFalse(any('start' in args for args, _ in commands))

class PlanTests(unittest.TestCase):
    def test_metadata_is_allowlisted_and_malformed_limits_do_not_crash(self):
        result = plan.public_plan({'type': 'chatgpt', 'planType': 'go', 'email': 'private@example.invalid', 'token': 'private-marker'}, {'rateLimits': []})
        self.assertEqual(result['plan_type'], 'go')
        self.assertFalse(result['matches_pinned_gs'])
        self.assertNotIn('private', json.dumps(result))
        result = plan.public_plan({}, {'rateLimits': {'primary': {'usedPercent': float('nan'), 'resetsAt': 42, 'extra': 'private'}}})
        self.assertEqual(result['allowance'], {'primary': {'resetsAt': 42}})

if __name__ == '__main__': unittest.main()

class ProtocolTests(unittest.TestCase):
    def test_installed_protocol_handshake_reads_plan_without_inference_or_broker_secrets(self):
        import os
        import sys
        real_popen = subprocess.Popen
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            fake = root / 'peer.py'
            fake.write_text('''import json,os,sys
assert 'GH_ADDMINPROVIDER-FINE_GRAINED' not in os.environ
assert 'OPENAI_API_KEY' not in os.environ
for line in sys.stdin:
 m=json.loads(line)
 if 'id' not in m: continue
 assert m['method'] in ['initialize','account/read','account/rateLimits/read']
 if m['method']=='account/read':
  assert m['params']['refreshToken'] is False
  result={'account':{'type':'chatgpt','planType':'go','email':'private@example.invalid'}}
 elif m['method']=='account/rateLimits/read':
  result={'rateLimits':{'planType':'go','primary':{'usedPercent':25,'resetsAt':42}}}
 else: result={}
 print(json.dumps({'method':'notification','params':{'private':'not-for-output'}}),flush=True)
 print(json.dumps({'id':m['id'],'result':result}),flush=True)
''')
            def popen(args, **kwargs):
                self.assertEqual(args[-1], 'app-server')
                return real_popen([sys.executable, str(fake)], **kwargs)
            with patch.object(plan.shutil, 'which', return_value='/synthetic/codex'), patch.object(plan.subprocess, 'Popen', side_effect=popen), patch.dict(os.environ, {'GH_ADDMINPROVIDER-FINE_GRAINED':'private-marker','OPENAI_API_KEY':'private-marker'}):
                result=plan.probe_account('fixture', directory, timeout=4)
            self.assertEqual(result['state'],'ACCOUNT_AND_LIMITS_READ')
            self.assertEqual(result['plan_type'],'go')
            self.assertEqual(result['allowance']['primary']['usedPercent'],25)
            self.assertFalse(result['inference_performed'])
            self.assertNotIn('private', json.dumps(result))
