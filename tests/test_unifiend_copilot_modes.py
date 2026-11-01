import importlib.util
import os
import pathlib
import tempfile
import unittest
from unittest.mock import patch

source = pathlib.Path(__file__).resolve().parents[1] / 'scripts/unifiend-copilot-modes.py'
spec = importlib.util.spec_from_file_location('unifiend_copilot_modes', source)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class CopilotModesTests(unittest.TestCase):
    def test_modes_share_one_cli_and_do_not_bypass_permissions(self):
        with tempfile.TemporaryDirectory() as home:
            for mode in module.MODES:
                command = module.command('/existing/copilot', mode, home, prompt='review')
                self.assertIn('--enable-all-github-mcp-tools', command)
                self.assertNotIn('--allow-all', command)
                self.assertNotIn('--no-sandbox', command)
                self.assertFalse('--stdio' in command and '--port' in command)

    def test_invalid_mode_port_and_workdir_fail_before_execution(self):
        with tempfile.TemporaryDirectory() as home:
            for operation in (
                lambda: module.command('/x', 'unknown', home),
                lambda: module.command('/x', 'acp-tcp', home, port=22),
                lambda: module.command('/x', 'prompt', home),
                lambda: module.command('/x', 'terminal', home + '/missing')
            ):
                with self.assertRaises(ValueError):
                    operation()

    def test_package_install_and_transport_environment_excludes_vault_values(self):
        with patch.dict(os.environ, {'INFISICAL_TOKEN': 'synthetic', 'GH_TOKEN': 'synthetic', 'DEEPSEEK_API_KEY': 'synthetic'}):
            result = module.clean_environment('/some/home')
            self.assertNotIn('INFISICAL_TOKEN', result)
            self.assertNotIn('GH_TOKEN', result)
            self.assertNotIn('DEEPSEEK_API_KEY', result)
            self.assertEqual(result['HOME'], '/some/home')

    def test_existing_install_is_preserved_without_npm_or_profile_write(self):
        with patch.object(module, 'resolve_executable', return_value='/existing/copilot'), patch.object(module.subprocess, 'run') as run:
            self.assertEqual(module.install_missing('/some/home'), 'EXISTING_PRESERVED')
            run.assert_not_called()

    def test_absent_binary_does_not_claim_auth_or_live_modes(self):
        with patch.object(module, 'resolve_executable', return_value=None):
            state = module.inspect('/some/home')
        self.assertFalse(state['installed'])
        self.assertEqual(state['authentication'], 'NOT_TESTED')
        self.assertEqual(state['quota'], 'NOT_TESTED')
        self.assertEqual(state['inference'], 'NOT_RUN')
        self.assertFalse(state['autostart'])

    def test_real_child_transports_initialize_without_requesting_session_or_model(self):
        fixture = '''#!/usr/bin/env python3
import json, socket, sys
if '--port' in sys.argv:
    server = socket.socket()
    server.bind(('127.0.0.1', int(sys.argv[sys.argv.index('--port')+1])))
    server.listen(1)
    client, address = server.accept()
    reader = client.makefile('rb')
    writer = client.makefile('wb')
else:
    reader, writer = sys.stdin.buffer, sys.stdout.buffer
request = json.loads(reader.readline())
assert request['method'] == 'initialize'
assert request['params']['clientCapabilities'] == {}
writer.write(json.dumps({'jsonrpc':'2.0','id':request['id'],'result':{'protocolVersion':1}}).encode()+bytes([10]))
writer.flush()
'''
        with tempfile.TemporaryDirectory() as home:
            executable = pathlib.Path(home) / 'fixture-copilot'
            executable.write_text(fixture)
            executable.chmod(0o700)
            for mode in ('acp-stdio', 'acp-tcp'):
                with self.subTest(mode=mode):
                    self.assertEqual(module.smoke_transport(str(executable), mode, home), 'INITIALIZE_VERIFIED_NO_INFERENCE')
            self.assertFalse((pathlib.Path(home) / 'copilot-smoke-state').exists())


if __name__ == '__main__':
    unittest.main()
