# OGENIC / WAVE — PageIndex (staging, no LLM)

Upstream: [VectifyAI/PageIndex](https://github.com/VectifyAI/PageIndex) · MIT · official Python package `pageindex==0.2.10`.

PageIndex is registered as an **optional Yellow document-reading tool**. Cloudflare Workers run JavaScript, **not Python**; the PageIndex SDK belongs on a separate Python runner. No new secrets, D1 schema, Green/1LSS store, vector DB, or approval gate are added.

## Current, free and local

```sh
python -m pip install -r integrations/pageindex/requirements.txt
python integrations/pageindex/bridge.py doctor
python integrations/pageindex/bridge.py outline --pdf path/to/text-based.pdf
```

- `doctor` checks the official SDK distribution and import without model calls.
- `outline` reads an **existing PDF bookmark/tree**, reporting page references and SHA-256. This *does not* generate a full PageIndex semantic index, does not OCR, and returns an empty tree for PDFs without embedded outlines.
- `index` explicitly returns `PAGEINDEX_LLM_NOT_ENABLED` and makes zero API calls.
- Owner-authenticated Yellow discovery: `GET /api/pageindex/status`. This is registration/health metadata **only**, not a remote Python execution endpoint.
- The isolated GitHub Actions workflow `.github/workflows/pageindex-optional-sdk-proof.yml` checks actual installation + local outline and zero-model guard on an ephemeral runner.

## Future (not activated)

Actual `PageIndexClient(index=..., chat=...)` indexing and reasoning retrieval would require a Python execution host and a chosen compatible LLM, explicit budget/usage approval, a quality benchmark and existing Yellow execution route. Do **not** call it working from the current registration status.

First choose small, text-based PDFs from authorized sources. Never send private documents or secrets to a third-party indexing service without separate authorization. Keep evidence and results in existing Ruby / Green procedures when enabled. Do not invent another policy gate.
