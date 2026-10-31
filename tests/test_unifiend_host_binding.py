import importlib.util
import pathlib
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("unifiend_binding", pathlib.Path(__file__).parents[1] / "scripts/unifiend-host-binding.py")
binding = importlib.util.module_from_spec(spec)
spec.loader.exec_module(binding)


class HostBindingTests(unittest.TestCase):
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


if __name__ == "__main__":
    unittest.main()
