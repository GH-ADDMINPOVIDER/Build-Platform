import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SELF = Path(__file__).resolve()

SECRET_ASSIGNMENT = re.compile(
    r"(?im)^\s*([A-Za-z0-9_.-]*(?:api[_-]?key|token|password|private[_-]?key)[A-Za-z0-9_.-]*)\s*[:=]\s*(.+?)\s*$"
)
DYNAMIC_SECRET_MARKERS = (
    "${{",
    "${",
    "$(",
    "secrets.",
    "vars.",
    "env.",
    "os.environ",
    "getenv(",
    "process.env",
    "secret_ref",
)
NON_SECRET_STATUS_SUFFIXES = (
    "bound",
    "configured",
    "present",
    "available",
)

NON_SECRET_TOKEN_KEYS = {
    "token_boost",
    "prompt_token_count",
    "candidates_token_count",
    "total_token_count",
    "prompt_tokens",
    "completion_tokens",
    "total_tokens",
    "max_output_tokens",
}

SECRET_PLACEHOLDERS = {
    "",
    "null",
    "none",
    "unset",
    "not set",
    "***",
    "redacted",
    "changeme",
    "change-me",
    "example",
    "placeholder",
    "your-token",
    "your_token",
    "your-api-key",
    "your_api_key",
    "xxx",
}


def is_non_secret_token_metric(key: str) -> bool:
    compact = re.sub(r"[^a-z0-9]", "", key.lower())
    safe_suffixes = (
        "inputtokens",
        "outputtokens",
        "prompttokens",
        "completiontokens",
        "totaltokens",
        "usagetokens",
        "tokensused",
        "tokencount",
        "tokenscount",
        "tokenlimit",
        "tokenslimit",
        "tokenbudget",
        "tokensbudget",
        "tokenboost",
    )
    return compact.endswith(safe_suffixes)


def looks_like_plaintext_secret(value: str) -> bool:
    cleaned = value.strip().rstrip(",").strip().strip('"').strip("'").strip()
    lowered = cleaned.lower()
    shell_var_ref = re.search(r"\$(?:\{?[A-Za-z_][A-Za-z0-9_]*\}?)", cleaned)

    if lowered in SECRET_PLACEHOLDERS:
        return False
    if shell_var_ref:
        return False
    if any(marker in lowered for marker in DYNAMIC_SECRET_MARKERS):
        return False
    if lowered.startswith(("<", "[", "{")) and any(
        word in lowered for word in ("example", "placeholder", "redacted")
    ):
        return False

    # A literal value assigned to a credential-shaped key is suspicious.
    # Short ordinary words are ignored to avoid flagging prose/examples.
    return len(cleaned) >= 12


def main() -> None:
    required = [
        ROOT / ".codex-plugin" / "plugin.json",
        ROOT / "skills" / "ogenic-phase-vi" / "SKILL.md",
        ROOT / "assets" / "toolkit-manifest.json",
        ROOT / "config" / "capabilities.json",
        ROOT / "config" / "providers.json",
        ROOT / "database" / "migrations" / "0001_phase_vi.sql",
        ROOT / "wrangler.jsonc",
        ROOT / "package.json",
        ROOT / "PRIVACY.md",
        ROOT / "TERMS.md",
    ]

    missing = [str(path.relative_to(ROOT)) for path in required if not path.is_file()]
    if missing:
        raise SystemExit(f"Missing required files: {', '.join(missing)}")

    plugin = json.loads((ROOT / ".codex-plugin" / "plugin.json").read_text())
    manifest = json.loads((ROOT / "assets" / "toolkit-manifest.json").read_text())
    capabilities = json.loads((ROOT / "config" / "capabilities.json").read_text())
    providers = json.loads((ROOT / "config" / "providers.json").read_text())

    if plugin.get("name") != "ogenic-phase-vi":
        raise SystemExit("Plugin name mismatch")
    plugin_version = str(plugin.get("version", ""))
    manifest_version = str(manifest.get("version", ""))
    if plugin_version != manifest_version:
        raise SystemExit(f"Plugin/manifest version mismatch: {plugin_version} != {manifest_version}")
    if not re.fullmatch(r"6\.\d+\.\d+", plugin_version):
        raise SystemExit(f"Invalid Phase VI semantic version: {plugin_version}")
    if plugin.get("skills") != "./skills/ogenic-phase-vi/":
        raise SystemExit("Plugin must expose exactly the Phase VI skill directory")
    if manifest.get("command_prefix") != "/OG":
        raise SystemExit("Command prefix mismatch")
    if manifest.get("toolkit_count") != 1:
        raise SystemExit("Phase VI must expose exactly one toolkit")
    if manifest.get("primary_runtime") != "Cloudflare Workers":
        raise SystemExit("Cloudflare Workers must be the primary runtime")
    if manifest.get("canonical_database") != "Cloudflare D1":
        raise SystemExit("D1 must be the canonical database")
    if capabilities.get("system") != "OGENIC PHASE VI":
        raise SystemExit("Capability registry mismatch")

    provider_ids = {item.get("id") for item in providers.get("providers", [])}
    required_providers = {"github", "google_drive", "linear", "documents", "template_creator", "infisical", "cloudflare"}
    missing_providers = sorted(required_providers - provider_ids)
    if missing_providers:
        raise SystemExit(f"Missing Phase VI providers: {', '.join(missing_providers)}")

    scanned_suffixes = {".md", ".json", ".jsonc", ".yaml", ".yml", ".py", ".sh", ".ts", ".tsx", ".sql"}
    for path in ROOT.rglob("*"):
        if not path.is_file() or path.resolve() == SELF:
            continue
        if path.suffix.lower() not in scanned_suffixes:
            continue
        text = path.read_text(errors="ignore")
        if "[TODO:" in text:
            raise SystemExit(f"Unfinished TODO in {path.relative_to(ROOT)}")

        for match in SECRET_ASSIGNMENT.finditer(text):
            key, value = match.groups()
            normalized_key = key.lower().replace("-", "_")
            leaf_key = normalized_key.rsplit(".", 1)[-1]
            if leaf_key in NON_SECRET_TOKEN_KEYS or is_non_secret_token_metric(leaf_key):
                continue
            compact_key = re.sub(r"[^a-z0-9]", "", leaf_key)
            if compact_key.endswith(NON_SECRET_STATUS_SUFFIXES):
                continue
            # Exact documented environment VARIABLE NAME in a third-party example.
            # This is not a credential value; do not weaken checks for any other key.
            if (
                path.relative_to(ROOT).as_posix()
                == "third_party/pstack-portable/automations/benny/templates/configuration.example.yaml"
                and leaf_key == "optional_bot_token_env"
                and value.strip().strip('"').strip("'") == "BENNY_SLACK_BOT_TOKEN"
            ):
                continue
            if looks_like_plaintext_secret(value):
                raise SystemExit(
                    f"Possible plaintext secret assignment in {path.relative_to(ROOT)}: {key}"
                )

    print("OGENIC Phase VI validation passed")


if __name__ == "__main__":
    main()
