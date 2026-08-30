# Secret-to-deployment pipeline

## Core flow

```text
Inspect → Resolve target → Check secret metadata → Develop → Build → Audit → Deploy → Verify → Save version
```

## Secret contract

- Apply `EXISTING → VERIFY → PRESERVE → REUSE`.
- Infisical is the preferred secret-value source of truth.
- GitHub encrypted Actions secrets are the runtime bridge.
- Notion, Drive, Markdown, logs, commits, and chat contain secret names and scopes only.
- Rotate only when compromised, expired, revoked, or explicitly requested.

## Developer workflow

1. Inspect the exact repository, branch, folder, store, site, and current deployment.
2. Create a snapshot, archive, export, or Git commit before a replacement.
3. Develop the smallest scoped change.
4. Run validation, lint, type checks, tests, and build steps that exist for the project.
5. Audit file references, asset paths, missing media, duplicate identifiers, and secret leakage.
6. Deploy only after the audit passes; keep TEST/DRY_RUN when production approval is absent.
7. Re-read the website/store/repository and save the verified ZIP/Markdown/index artifacts.

## Website image replacement

- Map Drive category folders to website/store groups before uploading.
- Keep left/right horizontal rails for every product group.
- Preserve product identity and ordering independently from image URLs.
- Use GitHub repository assets as the Cloudflare build source; copy the complete `assets/` tree into `dist/assets/`.
- Keep a stable fallback image URL where the storefront supports it.
- Replacing all images is destructive: preserve a catalog export and current media mapping first, then remove only the exact product media approved by the user.

## Surface fallback

1. Connected provider API/MCP.
2. GitHub Actions or hosted CI.
3. Authenticated browser.
4. `CONNECTOR_REQUIRED` with the missing capability.
