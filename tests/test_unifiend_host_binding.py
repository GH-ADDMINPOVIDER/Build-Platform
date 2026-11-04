import importlib.util
import pathlib
import tempfile
import unittest
import json

spec = importlib.util.spec_from_file_location("unifiend_binding", pathlib.Path(__file__).parents[1] / "scripts/unifiend-host-binding.py")
binding = importlib.util.module_from_spec(spec)
spec.loader.exec_module(binding)


class HostBindingTests(unittest.TestCase):
    def test_registration_json_reads_utf8_with_or_without_bom(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            config = {"agentId": 7, "gitHubUrl": "https://github.com/canonical/target"}
            for encoding in ["utf-8", "utf-8-sig"]:
                (root / ".runner").write_text(json.dumps(config), encoding=encoding)
                self.assertEqual(binding.load_registration_config(root), config)

    def test_registration_file_shape_is_explicit(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            (root / ".runner").write_text("[]")
            with self.assertRaisesRegex(ValueError, "REGISTRATION_CONFIG_INVALID_SHAPE"):
                binding.load_registration_config(root)

    def test_exec_start_resolves_config_when_systemd_working_directory_is_empty(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            (root / ".runner").write_text("{}")
            fields = {"WorkingDirectory": "", "ExecStart": "{ path=" + directory + "/runsvc.sh ; argv[]=private-fixture-marker ; }"}
            self.assertEqual(binding.registration_directory(fields), root)

    def test_wrong_principal_stops_before_repository_or_host_access(self):
        calls = []
        def api(path):
            calls.append(path)
            return {"id": 306097555}
        result = binding.inspect_binding(api, run=lambda *args, **kwargs: self.fail("host read forbidden"))
        self.assertEqual(calls, ["/user"])
        self.assertEqual(result["failure"]["code"], "OPERATIONAL_IDENTITY_MISMATCH")

    def test_actual_primary_binding_requires_repository_url_and_registration_id_and_name(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            (root / ".runner").write_text("{}")
            def api(path):
                if path == "/user": return {"id": 342175560}
                if path.startswith("/repositories/"): return {"id": 1429580446, "owner": {"id": 342175560}, "full_name": "canonical/target", "html_url": "https://github.com/canonical/target"}
                return {"total_count": 1, "runners": [{"id": 7, "name": "existing-host", "status": "online", "busy": False}]}
            def run(args, **kwargs):
                if args[1] == "list-units": return "actions.existing.service loaded active running\n"
                return "WorkingDirectory=\nExecStart={ path=" + directory + "/runsvc.sh ; argv[]=private-fixture-marker ; }\nActiveState=active\nUser=existing-user\n"
            for url, expected in [("https://github.com/canonical/target", True), ("https://github.com/historical/source", False)]:
                result = binding.inspect_binding(api, run=run, read_config=lambda p: {"gitHubUrl": url, "agentId": 7, "agentName": "existing-host", "private": "private-fixture-marker"})
                self.assertEqual(result["ok"], expected)
                self.assertEqual(result["services"][0]["registered_in_primary"], expected)
                self.assertNotIn("private-fixture-marker", str(result))

    def test_repository_url_cannot_emit_credentials_or_query_tokens(self):
        for url in ["https://secret@github.com/a/b", "https://github.com/a/b?token=private", "https://attacker.test/a/b"]:
            self.assertIsNone(binding.safe_repository_url(url))

    def test_invalid_registration_does_not_hide_stage_or_emit_file_values(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            (root / ".runner").write_text('private-fixture-marker')
            def api(path):
                if path == "/user": return {"id": 342175560}
                if path.startswith("/repositories/"): return {"id": 1429580446, "owner": {"id": 342175560}, "full_name": "canonical/target", "html_url": "https://github.com/canonical/target"}
                return {"total_count": 0, "runners": []}
            def run(args, **kwargs):
                if args[1] == "list-units": return "actions.existing.service loaded active running\n"
                return "WorkingDirectory=" + directory + "\nActiveState=active\nUser=existing-user\n"
            result = binding.inspect_binding(api, run=run)
            self.assertEqual(result['failure']['stage'], 'registration_file_read')
            self.assertEqual(result['failure']['code'], 'REGISTRATION_JSON_INVALID')
            self.assertNotIn('private-fixture-marker', str(result))

    def test_complete_inspection_reads_bom_config_with_no_primary_registration(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            (root / ".runner").write_text(json.dumps({"agentId": 7, "agentName": "existing-host", "gitHubUrl": "https://github.com/historical/source", "unused": "private-fixture-marker"}), encoding="utf-8-sig")
            def api(path):
                if path == "/user": return {"id": 342175560}
                if path.startswith("/repositories/"): return {"id": 1429580446, "owner": {"id": 342175560}, "full_name": "canonical/target", "html_url": "https://github.com/canonical/target"}
                return {"total_count": 0, "runners": []}
            def run(args, **kwargs):
                if args[1] == "list-units": return "actions.existing.service loaded active running\n"
                return "WorkingDirectory=\nExecStart={ path=" + directory + "/runsvc.sh ; argv[]=private-fixture-marker ; }\nActiveState=active\nUser=existing-user\n"
            result = binding.inspect_binding(api, run=run)
            self.assertNotIn('failure', result)
            self.assertEqual(result['primary_registration_count'], 0)
            self.assertEqual(result['services'][0]['repository_binding'], 'https://github.com/historical/source')
            self.assertEqual(result['services'][0]['binding_state'], 'DIFFERENT_OR_STALE_BINDING')
            self.assertNotIn('private-fixture-marker', str(result))


if __name__ == "__main__":
    unittest.main()
