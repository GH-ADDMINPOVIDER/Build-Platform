import importlib.util
import json
import pathlib
import tempfile
import unittest
from unittest.mock import patch
ROOT = pathlib.Path(__file__).parents[1]
spec = importlib.util.spec_from_file_location('opencode_wrapper', ROOT / 'scripts/unifiend-opencode.py')
wrapper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(wrapper)

class OpenCodeTests(unittest.TestCase):
    def test_only_selected_provider_key_reaches_child(self):
        env = wrapper.child_environment({'PATH':'/usr/bin','HOME':'/nonsecret','DEEPSEEK_API_KEY':'synthetic-provider',
            'GH_ADDMINPROVIDER-FINE_GRAINED':'synthetic-admin','OGENIC_OPS_KEY':'synthetic-owner','OPENAI_API_KEY':'synthetic-other','CODEX_HOME':'/root/private'}, 'deepseek/fixture-model', 'tui')
        self.assertNotIn('synthetic-admin', str(env))
        self.assertNotIn('synthetic-owner', str(env))
        self.assertNotIn('synthetic-other', str(env))
        self.assertNotIn('CODEX_HOME', env)
        config = json.loads(env['OPENCODE_CONFIG_CONTENT'])
        self.assertEqual(config['enabled_providers'], ['deepseek'])
        self.assertFalse(config['lsp'])
        self.assertEqual(config['provider']['deepseek']['options']['apiKey'], '{env:DEEPSEEK_API_KEY}')
        self.assertNotIn('synthetic-provider', env['OPENCODE_CONFIG_CONTENT'])

    def test_missing_reference_or_wrong_provider_is_not_replaced_by_another_account(self):
        for model in ('', 'openai/fixture', 'deepseek/'):
            with self.assertRaises(ValueError): wrapper.child_environment({'OPENAI_API_KEY':'synthetic'}, model, 'tui')
        with self.assertRaises(ValueError): wrapper.child_environment({}, 'deepseek/fixture', 'tui')
        with self.assertRaisesRegex(ValueError, 'PASSWORD_REFERENCE_REQUIRED'):
            wrapper.child_environment({'DEEPSEEK_API_KEY':'synthetic'}, 'deepseek/fixture', 'serve')

    def test_server_launch_binds_loopback_and_keeps_key_out_of_arguments(self):
        with tempfile.TemporaryDirectory() as home, patch.object(wrapper.shutil, 'which', return_value='/usr/bin/opencode'), patch.object(wrapper.os, 'geteuid', return_value=1000), patch.object(wrapper.subprocess, 'run') as git, patch.object(wrapper.subprocess, 'call', return_value=0) as call:
            git.return_value.stdout = 'Unified-on-Progress\n'
            result = wrapper.run('serve', 'deepseek/fixture', {'HOME':home, 'PATH':'/usr/bin','DEEPSEEK_API_KEY':'synthetic-provider','OPENCODE_SERVER_PASSWORD':'synthetic-password'})
            self.assertEqual(result['exit_code'],0)
            self.assertEqual(call.call_args.args[0], ['/usr/bin/opencode','serve','--hostname','127.0.0.1','--port','4096'])
            self.assertNotIn('synthetic', str(call.call_args.args))

    def test_status_does_not_infer_auth_or_install_packages(self):
        with patch.object(wrapper.shutil, 'which', return_value=None), patch.object(wrapper.subprocess, 'call') as call:
            result=wrapper.run('status', '')
            self.assertFalse(result['installed'])
            self.assertFalse(result['inference_performed'])
            call.assert_not_called()

if __name__=='__main__': unittest.main()

class InstallerTests(unittest.TestCase):
    def test_existing_install_is_preserved_and_vault_env_is_not_forwarded(self):
        spec=importlib.util.spec_from_file_location('host_tools', ROOT/'scripts/unifiend-host-tools.py')
        host=importlib.util.module_from_spec(spec);spec.loader.exec_module(host)
        with patch.object(host,'inspect_tools',return_value={'tools':{'opencode':True}}), patch.object(host.subprocess,'run') as run:
            self.assertEqual(host.install_opencode()['install'],'EXISTING_PRESERVED');run.assert_not_called()
        from types import SimpleNamespace
        account=SimpleNamespace(pw_name='wave',pw_dir='/home/wave')
        with patch.object(host,'inspect_tools',return_value={'tools':{'opencode':False}}), patch.object(host.os,'geteuid',return_value=0), patch.object(host.pwd,'getpwnam',return_value=account), patch.object(host.shutil,'which',return_value='/usr/bin/npm'), patch.object(host.subprocess,'run') as run:
            run.side_effect=[SimpleNamespace(returncode=0),SimpleNamespace(returncode=0,stdout=(host.VERSION+'\n').encode())]
            result=host.install_opencode()
            self.assertEqual(result['install'],'INSTALLED_VERSION_VERIFIED')
            args=run.call_args_list[0]
            self.assertIn('opencode-ai@'+host.VERSION,args.args[0])
            self.assertEqual(set(args.kwargs['env']),{'PATH','LANG'})
            self.assertFalse(result['public_listener_started'])
