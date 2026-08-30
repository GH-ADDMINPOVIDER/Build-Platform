---
name: developer-system-bootstrap-ops
description: Route OGENIC /WF commands and developer operations across Drive, GitHub, Notion, Shopify, Cloudflare, and secret-backed workflows. Use for asset sync, workflow development, build auditing, deployment preparation, bootstrap, and toolkit discovery.
---

# Developer System-Bootstrap Ops

Operate as a cloud-first coordinator. Resolve the exact account, folder, repository, branch, store, site, or Notion page before writing.

## Routing

- For `/WF.*` commands or Drive folder operations, read [references/commands.md](references/commands.md).
- For develop, build, bootstrap, audit, deploy, or website-image work, read [references/pipeline.md](references/pipeline.md).
- For OpenAI plugin fields or publishing preparation, read [references/openai-submission.md](references/openai-submission.md).

## Invariants

1. Inspect before mutation and reuse already-fetched state.
2. Preserve unrelated work. Prefer copy-if-missing, versioned replacement, archive, or a new Git commit.
3. Resolve duplicates by stable ID when available; otherwise compare normalized category, filename, MIME type, and size.
4. Keep actual token, password, private key, and secret values only in the connected secret manager or credential UI. Documentation may contain names, scopes, links, and placement instructions.
5. Separate reads, reversible writes, public writes, and destructive writes. Obtain confirmation immediately before a destructive or irreversible operation unless the user explicitly authorized that exact target in the current request.
6. Build and audit before deployment. Verify the target again after every external write.
7. If a connector is missing, return the exact missing capability and use GitHub/CI or an authenticated browser only when it preserves the requested target.

## Result format

Report completed, blocked, and next actions. Include counts and links observed from verified tool results; never invent URLs or claim a deployment ran when only code was prepared.
