#!/usr/bin/env python3
"""Unifiend Yellow's opt-in PageIndex SDK bridge: no LLM/API calls in this phase.

This is NOT PageIndex reasoning retrieval. 'outline' only reads PDF-embedded
bookmarks as a free deterministic precursor. Actual PageIndex index/chat will
need explicit model provisioning and separate approval when requested.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.metadata
import json
from pathlib import Path
import sys

EXPECTED_SDK_VERSION = "0.2.10"
MAX_LOCAL_PDF_BYTES = 25 * 1024 * 1024
MAX_OUTLINE_NODES = 300
ENGINE = "PageIndex-Python-SDK"


def emit(result: dict, code: int = 0) -> int:
    print(json.dumps(result, ensure_ascii=False, sort_keys=True))
    return code


def sdk_version() -> str | None:
    try:
        return importlib.metadata.version("pageindex")
    except importlib.metadata.PackageNotFoundError:
        return None


def doctor() -> int:
    installed = sdk_version()
    if installed == EXPECTED_SDK_VERSION:
        try:
            from pageindex import PageIndexClient  # noqa: F401  # SDK import only, no calls
        except Exception:
            return emit({"ok": False, "code": "PAGEINDEX_SDK_IMPORT_FAILED", "paid_api_requests": 0}, 2)
    return emit({
        "ok": installed == EXPECTED_SDK_VERSION,
        "tool": ENGINE,
        "sdk_version": installed,
        "expected_version": EXPECTED_SDK_VERSION,
        "mode": "LOCAL_READ_ONLY",
        "llm_calls_enabled": False,
        "paid_api_requests": 0,
        "document_indexing_enabled": False,
        "next_action": "INSTALL_OPTIONAL_PYTHON_DEPENDENCY" if installed is None
                       else "CHECK_SDK_PIN" if installed != EXPECTED_SDK_VERSION
                       else "READY_FOR_LOCAL_PDF_OUTLINE",
    }, 0 if installed == EXPECTED_SDK_VERSION else 2)


def outline(pdf_path: str) -> int:
    # Never upload a document or call PageIndex Cloud. Only extract its
    # own embedded bookmarks locally. Scanned PDF/blank TOC => empty tree.
    path = Path(pdf_path).expanduser().resolve()
    if not path.is_file() or path.suffix.lower() != ".pdf":
        return emit({"ok": False, "code": "LOCAL_TEXT_PDF_REQUIRED"}, 2)
    size = path.stat().st_size
    if size > MAX_LOCAL_PDF_BYTES:
        return emit({"ok": False, "code": "PDF_TOO_LARGE", "limit_bytes": MAX_LOCAL_PDF_BYTES}, 2)
    try:
        from PyPDF2 import PdfReader
    except ImportError:
        return emit({"ok": False, "code": "PYTHON_DEPENDENCY_NOT_INSTALLED"}, 2)

    try:
        # Local binary read only; SHA identifies evidence without repeating
        # document text, full file path or credential data in outputs.
        with path.open("rb") as handle:
            digest = hashlib.file_digest(handle, "sha256").hexdigest()
        reader = PdfReader(str(path), strict=False)
        tree: list[dict] = []
        count = 0

        def visit(items: list, target: list[dict], depth: int = 0) -> None:
            nonlocal count
            if depth > 12 or count >= MAX_OUTLINE_NODES:
                return
            last: dict | None = None
            for item in items:
                if count >= MAX_OUTLINE_NODES:
                    break
                if isinstance(item, list):
                    if last is not None:
                        visit(item, last["children"], depth + 1)
                    else:
                        visit(item, target, depth + 1)
                    continue
                title = str(getattr(item, "title", "")).strip()[:160]
                if not title:
                    continue
                try:
                    page_number = reader.get_destination_page_number(item) + 1
                except Exception:
                    page_number = None
                node = {"title": title, "page": page_number, "children": []}
                target.append(node)
                last = node
                count += 1

        visit(reader.outline or [], tree)
        return emit({
            "ok": True,
            "mode": "PDF_EMBEDDED_OUTLINE_ONLY",
            "is_full_pageindex_index": False,
            "source_sha256": digest,
            "pages": len(reader.pages),
            "outline_nodes": count,
            "tree": tree,
            "llm_calls_enabled": False,
            "paid_api_requests": 0,
            "retained_in_green": False,
        })
    except Exception:
        # Never echo provider messages or private document paths into logs.
        return emit({"ok": False, "code": "PDF_OUTLINE_UNREADABLE"}, 2)


def main() -> int:
    parser = argparse.ArgumentParser(description="Unifiend PageIndex optional no-LLM bridge")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("doctor", help="Verify the official Python SDK is pinned locally")
    outline_arg = sub.add_parser("outline", help="Extract an embedded PDF table of contents without LLM")
    outline_arg.add_argument("--pdf", required=True)
    sub.add_parser("index", help="Fail closed; PageIndex indexing with LLM is not enabled")
    args = parser.parse_args()

    if args.command == "doctor":
        return doctor()
    if args.command == "outline":
        return outline(args.pdf)
    return emit({"ok": False, "code": "PAGEINDEX_LLM_NOT_ENABLED", "paid_api_requests": 0}, 3)


if __name__ == "__main__":
    sys.exit(main())
