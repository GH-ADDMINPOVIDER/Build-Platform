import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    "validate_toolkit", Path(__file__).resolve().parents[1] / "scripts/validate_toolkit.py"
)
scanner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(scanner)


class SecretAssignmentDetection(unittest.TestCase):
    def test_environment_reference_fields_require_binding_identifiers(self):
        self.assertTrue(scanner.is_environment_reference("optional_bot_token_env", '"BENNY_SLACK_BOT_TOKEN"'))
        self.assertFalse(scanner.is_environment_reference("optional_bot_token_env", '"fixture-not-a-real-credential"'))
        self.assertFalse(scanner.is_environment_reference("bot_token", '"BENNY_SLACK_BOT_TOKEN"'))

    def test_connector_binding_names_are_not_values(self):
        for value in (
            '["GITHUB_TOKEN", "LINEAR_API_KEY", "N8N_API_KEY"],',
            '["INFISICAL_MACHINE_IDENTITY", "INFISICAL_PROJECT_ID", "INFISICAL_ENVIRONMENT"],',
        ):
            with self.subTest(value=value):
                self.assertFalse(scanner.looks_like_plaintext_secret(value))

    def test_literal_and_mixed_values_remain_detected(self):
        for value in (
            '"fixture-not-a-real-credential"',
            '["fixture-not-a-real-credential"],',
            '["GITHUB_TOKEN", "fixture-not-a-real-credential"],',
            '["GITHUB_TOKEN", 123],',
            '["UNCLASSIFIED_LITERAL_VALUE"],',
        ):
            with self.subTest(value=value):
                self.assertTrue(scanner.looks_like_plaintext_secret(value))

    def test_binding_names_as_scalar_values_are_still_suspicious(self):
        self.assertTrue(scanner.looks_like_plaintext_secret('"LINEAR_API_KEY"'))

    def test_dynamic_bindings_and_placeholders_stay_supported(self):
        for value in ('process.env.GITHUB_TOKEN', '${{ secrets.GH_ADDMINPROVIDER }}', '"redacted"'):
            with self.subTest(value=value):
                self.assertFalse(scanner.looks_like_plaintext_secret(value))


if __name__ == "__main__":
    unittest.main()

class RuntimeLookupDetection(unittest.TestCase):
    def test_mapping_reads_are_dynamic_but_literal_fallbacks_remain_suspicious(self):
        for value in ('registration.get("token")', 'source.get("OPENCODE_SERVER_PASSWORD", "")', 'metadata.get("key", None)'):
            self.assertFalse(scanner.looks_like_plaintext_secret(value))
        for value in ('registration.get("token", "synthetic-credential-value")', '{"token":"synthetic-credential-value"}.get("token")', 'registration.get("token") or "synthetic-credential-value"'):
            self.assertTrue(scanner.looks_like_plaintext_secret(value))
