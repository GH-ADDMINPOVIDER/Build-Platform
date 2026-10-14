# OGENIC GS/GT ChatGPT plugins ↔ Infisical service metadata audit

_Date: 2026-10-14; canonical staging evidence-only; no credentials moved._

## Read scopes and evidence

- **ChatGPT session reachable in this conversation**: 15 app plugins positively identified by Plugin Directory installed flags. The app-directory lookup is a sampled inventory, **not a system-wide guaranteed exhaustive enumeration**.
- **Other ChatGPT account (GS or GT)**: **NOT INSPECTED**, because app/plugin installation and authorization are separate per ChatGPT login. Account switching cannot be inferred or achieved through Runner-01, Codex login, or Infisical credential names.
- **Infisical**: Live audit through existing authorized OGENIC organization OIDC on `wave-runner-01`. [GitHub Actions run #38495706756](https://github.com/Ogenicchocolate21debug/Build-Platform/actions/runs/38495706756), sanitized JSON artifact `ogenic-infisical-service-map-38495706756`.
- Result `METADATA_READ_SUCCESS`: **2 accessible projects**, **3 environments scanned**, **78 secret-key metadata records**, **11 recognized service groups**, **29 keys unclassified by service-key pattern**. These are names/counts only; **no secret values printed or exported**.
- This test did not run plugin APIs or test credential validity, subscriptions, ChatGPT installation in a second account, or Secret Sync.

## Installed flags in reachable ChatGPT session (15)

`GitHub`, `Vercel`, `Railway`, `Lovable`, `OpenAI Developers`, `Context7`, `Statsig`, `Notion`, `ClickUp`, `Linear`, `Gmail`, `Outlook Email`, `Shopify`, `Figma`, `Canva`.

The tool groups Manus, DataCamp and AppDeploy are accessible in this ChatGPT session, but their installed plugin status was not independently verified through directory installed flags.

## Service labels found in Infisical metadata, NOT proof of installed ChatGPT plugins

| Detected Infisical service name | Plugin installed in reachable ChatGPT account | Other ChatGPT account | Meaning |
| --- | --- | --- | --- |
| GitHub | Yes | Not inspected | A Secret key name for GitHub is present, not verified as a valid connector credential |
| Vercel | Yes | Not inspected | Key-name signal |
| ClickUp | Yes | Not inspected | Key-name signal |
| Gmail / Google | Gmail: Yes | Not inspected | Google-family key-name signal; may belong to a different Google service |
| Linear | Yes | Not inspected | Key-name signal |
| Notion | Yes | Not inspected | Key-name signal |
| OpenAI / Codex | OpenAI Developers: Yes, but not an equivalent credential | Not inspected | Key-name signal only; no proof Codex login/API key matches Suthi account |
| Cloudflare | Standalone plugin not confirmed | Not inspected | Key-name signal |
| LINE | Standalone plugin not confirmed | Not inspected | Key-name signal |
| Meta | Standalone plugin not confirmed | Not inspected | Key-name signal |
| n8n | Standalone plugin not confirmed | Not inspected | Key-name signal |

**Reachable plugins with NO matching service-name pattern in this metadata scan:** Railway, Lovable, Context7, Statsig, Outlook Email, Shopify, Figma, Canva. **Do not infer missing Secret**: these apps may use built-in OAuth, alias key names, another project/account/environment, or one of 29 unclassified keys.

## Guardrails and required last mile

1. Infisical metadata is not a ChatGPT plugin registry. A stored API key is neither proof of a working connector nor installation in GS/GT.
2. Only `wave-runner-01` used existing authorized OIDC identity to read metadata using `viewSecretValue=false`. No Secret values, tokens, or exact Secret keys appear in this report.
3. To audit the *second* ChatGPT account, sign into that account and run Plugin Directory checks from inside that session; record installed flags into a second report. **Do not share ChatGPT cookies, passwords, or auth tokens**.
4. Do not grant Runner-2 new Infisical secret authority or propagate Secrets to GitHub or ChatGPT accounts automatically. A separate approval and scoped workflow would be required.
5. If a key is missing from the name-match report, inspect the 29 unclassified key-name metadata **inside Infisical UI with authorized access** before declaring absence; do not print values.
6. If credential verification is needed, run bounded, service-specific read-only authorization tests through existing Runner-01 after explicit service selection, never across all tokens blindly.

## Links

- [Infisical live metadata audit](https://github.com/Ogenicchocolate21debug/Build-Platform/actions/runs/38495706756)
- [Host/software inventory](https://github.com/Ogenicchocolate21debug/Build-Platform/actions/runs/38493903293)
- [Earlier plugin and host capability matrix](./OGENIC_PLUGIN_HOST_CAPABILITY_MATRIX_2026-10-14.md)
