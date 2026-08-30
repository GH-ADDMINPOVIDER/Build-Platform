import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    required = [
        ROOT / ".codex-plugin" / "plugin.json",
        ROOT / "skills" / "developer-system-bootstrap-ops" / "SKILL.md",
        ROOT / "assets" / "toolkit-manifest.json",
        ROOT / "PRIVACY.md",
        ROOT / "TERMS.md",
    ]
    missing = [str(path.relative_to(ROOT)) for path in required if not path.is_file()]
    if missing:
        raise SystemExit(f"Missing required files: {', '.join(missing)}")

    plugin = json.loads(required[0].read_text())
    manifest = json.loads(required[2].read_text())
    if plugin.get("name") != "developer-system-bootstrap-ops":
        raise SystemExit("Plugin name mismatch")
    if manifest.get("command_prefix") != "/WF":
        raise SystemExit("Command prefix mismatch")

    for path in ROOT.rglob("*"):
        if path.is_file() and path.suffix.lower() in {".md", ".json", ".yaml", ".yml", ".py"}:
            text = path.read_text(errors="ignore")
            unfinished_marker = "[" + "TODO:"
            if unfinished_marker in text:
                raise SystemExit(f"Unfinished TODO in {path.relative_to(ROOT)}")
    print("Developer System-Bootstrap Ops validation passed")


if __name__ == "__main__":
    main()
