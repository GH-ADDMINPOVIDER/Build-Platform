import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load_json(path: Path):
    try:
        return json.loads(path.read_text())
    except Exception as exc:
        raise SystemExit(f"Invalid JSON in {path.relative_to(ROOT)}: {exc}") from exc


def main() -> None:
    required = [
        ROOT / "plugin.json",
        ROOT / ".codex-plugin" / "plugin.json",
        ROOT / "skills" / "ogenic-god-toolkit" / "SKILL.md",
        ROOT / "skills" / "ogenic-god-toolkit" / "agents" / "openai.yaml",
        ROOT / "skills" / "ogenic-god-toolkit" / "references" / "CAPABILITY_INDEX.json",
        ROOT / "skills" / "ogenic-god-toolkit" / "references" / "TOOL_REGISTRY.json",
        ROOT / "skills" / "ogenic-god-toolkit" / "references" / "ROUTER_POLICY.md",
        ROOT / "skills" / "ogenic-god-toolkit" / "references" / "BUYER_INTENT_RADAR.md",
        ROOT / "skills" / "developer-system-bootstrap-ops" / "SKILL.md",
        ROOT / "assets" / "toolkit-manifest.json",
        ROOT / "PRIVACY.md",
        ROOT / "TERMS.md",
        ROOT / "docs" / "PLUGIN_SUBMISSION_TEST_CASES.md",
        ROOT / "apps" / "ogenic-control-tower" / "package-lock.json",
    ]
    missing = [str(path.relative_to(ROOT)) for path in required if not path.is_file()]
    if missing:
        raise SystemExit(f"Missing required files: {', '.join(missing)}")

    portable_plugin = load_json(ROOT / "plugin.json")
    plugin = load_json(ROOT / ".codex-plugin" / "plugin.json")
    capabilities = load_json(ROOT / "skills" / "ogenic-god-toolkit" / "references" / "CAPABILITY_INDEX.json")
    registry = load_json(ROOT / "skills" / "ogenic-god-toolkit" / "references" / "TOOL_REGISTRY.json")
    legacy_manifest = load_json(ROOT / "assets" / "toolkit-manifest.json")

    if plugin.get("name") != "ogenic-god-toolkit" or plugin.get("version") != "1.3.0":
        raise SystemExit("OGENIC plugin name/version mismatch")
    if portable_plugin.get("$schema") != "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json":
        raise SystemExit("Portable Agent Plugins schema is missing or unsupported")
    if portable_plugin.get("name") != plugin.get("name") or portable_plugin.get("version") != plugin.get("version"):
        raise SystemExit("Portable and compatibility plugin identity mismatch")
    interface = portable_plugin.get("extensions", {}).get("com.openai", {}).get("interface", {})
    prompts = interface.get("defaultPrompt", [])
    if not isinstance(prompts, list) or not 1 <= len(prompts) <= 3:
        raise SystemExit("Portable plugin must declare one to three starter prompts")
    if any(not isinstance(prompt, str) or not prompt.strip() or len(prompt) > 128 for prompt in prompts):
        raise SystemExit("Portable plugin starter prompts must be non-empty strings of at most 128 characters")
    compatibility_prompts = plugin.get("interface", {}).get("defaultPrompt", [])
    if compatibility_prompts != prompts:
        raise SystemExit("Portable and compatibility starter prompts must match")
    if capabilities.get("version") != "1.3.0" or capabilities.get("entry_point") != "ogenic-god-toolkit":
        raise SystemExit("Capability Index name/version mismatch")
    if registry.get("version") != "1.3.0":
        raise SystemExit("Tool Registry version mismatch")
    yellow_stone = next(
        (surface for surface in registry.get("surfaces", []) if surface.get("name") == "Yellow Stone"),
        None,
    )
    if yellow_stone is None:
        raise SystemExit("Yellow Stone tool option is missing")
    forbidden_authority_fields = {"roles", "role", "principal", "permissions", "approval_authority"}
    if yellow_stone.get("kind") != "tool_option" or any(
        field in yellow_stone for field in forbidden_authority_fields
    ):
        raise SystemExit("Yellow Stone must be a tool option without a role or authority")
    if yellow_stone.get("authority") != "none":
        raise SystemExit("Yellow Stone must not carry authority")
    if len(capabilities.get("groups", [])) != 11:
        raise SystemExit("Capability Index must contain groups 00 through 10")

    # Legacy Developer System-Bootstrap Ops remains intentionally present until parity is verified.
    if legacy_manifest.get("command_prefix") != "/WF":
        raise SystemExit("Legacy /WF compatibility manifest mismatch")

    skill_text = (ROOT / "skills" / "ogenic-god-toolkit" / "SKILL.md").read_text()
    for required_text in ["Human Approval", "Never simulate success", "Developer Operations Compatibility"]:
        if required_text not in skill_text:
            raise SystemExit(f"Master skill is missing required contract text: {required_text}")

    for path in ROOT.rglob("*"):
        if path.is_file() and path.suffix.lower() in {".md", ".json", ".yaml", ".yml", ".py", ".js", ".mjs"}:
            text = path.read_text(errors="ignore")
            unfinished_marker = "[" + "TODO:"
            if unfinished_marker in text:
                raise SystemExit(f"Unfinished TODO in {path.relative_to(ROOT)}")

    print("OGENIC GOD TOOLKIT v1.3.0 validation passed; legacy /WF compatibility preserved")


if __name__ == "__main__":
    main()
