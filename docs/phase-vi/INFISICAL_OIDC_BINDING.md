# Phase VI — Infisical OIDC Binding

## Goal

GitHub Actions authenticates to Infisical with GitHub OIDC and an Infisical Machine Identity. No long-lived `INFISICAL_CLIENT_SECRET` is stored in GitHub.

## Public repository variables

These values are identifiers/configuration, not secret values:

- `INFISICAL_IDENTITY_ID` — Infisical Machine Identity ID.
- `INFISICAL_PROJECT_SLUG` — Infisical project slug used by Phase VI.
- `INFISICAL_ENV_SLUG` — environment slug, initially `staging`.
- `INFISICAL_SECRET_PATH` — secret folder to read. During migration this may point at the verified legacy Cloudflare connector path; final Phase VI target is `/providers/cloudflare/prod` after reconciliation.

## Trust contract

Infisical Machine Identity must use OIDC for GitHub Actions and trust only the Build-Platform repository/context required for Phase VI. GitHub workflow permissions must include `id-token: write` and `contents: read`.

## Secret contract

The selected Infisical path must expose these names to the staging deploy job:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

Never commit or print their values. D1 stores only provider/secret references.

## Transition rule

The staging workflow keeps the current GitHub encrypted-secret path as a temporary fallback while OIDC is being verified. Once the OIDC probe and staging deployment both pass using Infisical, remove the fallback and make Infisical the only secret source.

## Verification order

1. Configure the Infisical Machine Identity OIDC trust.
2. Add the four public repository variables above.
3. Run the Phase VI staging workflow.
4. Verify Infisical OIDC succeeds without any secret value in logs.
5. Verify D1 migrations, Worker deploy, and `/api/health` still pass.
6. Remove GitHub long-lived Cloudflare deployment secrets only after the Infisical path is verified.
