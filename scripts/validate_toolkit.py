import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SELF = Path(__file__).resolve()


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
    if plugin.get("version") != "6.0.0":
        raise SystemExit("Plugin version mismatch")
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

    secret_words = ("api_key=", "token=", "password=", "private_key=")
    for path in ROOT.rglob("*"):
        if not path.is_file() or path.resolve() == SELF:
            continue
        if path.suffix.lower() not in {".md", ".json", ".jsonc", ".yaml", ".yml", ".py", ".ts", ".tsx", ".sql"}:
            continue
        text = path.read_text(errors="ignore")
        if "[TODO:" in text:
            raise SystemExit(f"Unfinished TODO in {path.relative_to(ROOT)}")
        lowered = text.lower()
        if any(word in lowered for word in secret_words):
            raise SystemExit(f"Possible plaintext secret marker in {path.relative_to(ROOT)}")

    print("OGENIC Phase VI validation passed")


if __name__ == "__main__":
    main()
