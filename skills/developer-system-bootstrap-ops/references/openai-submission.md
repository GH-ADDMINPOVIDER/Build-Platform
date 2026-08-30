# OpenAI submission draft

Official references:

- https://developers.openai.com/plugins/deploy/submission
- https://developers.openai.com/plugins/deploy/app-review
- https://developers.openai.com/plugins/plan/tools

## Listing fields

| Field | Draft value |
|---|---|
| Plugin name | Developer System-Bootstrap Ops |
| Short description | Build, audit, bootstrap, and synchronize OGENIC developer workflows across connected cloud services. |
| Long description | Developer System-Bootstrap Ops coordinates Drive assets, GitHub repositories, Notion documentation, Shopify catalogs, Cloudflare deployments, and secret-backed workflows. It inspects before writing, separates secret metadata from secret values, preserves recoverable versions, audits builds, and verifies external changes before saving. |
| Category | Developer Tools |
| Developer identity | Select the verified TAWATCHAI SAMORNRUM or verified OGENIC business identity in the same OpenAI organization. |
| Website | https://github.com/Ogenicchocolate21debug/Build-Platform |
| Support | https://github.com/Ogenicchocolate21debug/Build-Platform/issues |
| Privacy policy | https://github.com/Ogenicchocolate21debug/Build-Platform/blob/main/PRIVACY.md |
| Terms | https://github.com/Ogenicchocolate21debug/Build-Platform/blob/main/TERMS.md |
| Submission type | Skills only for the current validated bundle; choose With MCP only after a public production MCP endpoint exists. |
| MCP URL type | Universal when a single production URL serves all users. |
| Country availability | Thailand first; add other countries only when support and data handling are ready. |
| Release notes | Initial release with /WF command routing, Drive asset sync policy, secret-to-build workflow, audit, bootstrap, and OpenAI submission guidance. |

## Starter prompts

1. `Use /WF.index and show the connected workflow databases.`
2. `Sync new Cloudflare photo assets to Shopify and Main Photo without overwriting files.`
3. `Audit the Candy storefront build and report missing asset paths.`
4. `Bootstrap this repository for TEST deployment using existing secret references.`
5. `Check secret configuration names without revealing secret values.`

## Proposed MCP tool contracts

| Name | Purpose | readOnlyHint | openWorldHint | destructiveHint |
|---|---|---:|---:|---:|
| `wf_help` | List command grammar and supported surfaces. | true | false | false |
| `wf_index` | List workflow databases and verified connections. | true | false | false |
| `list_photo_assets` | List category-scoped Drive media. | true | false | false |
| `sync_photo_assets` | Copy missing Drive media without overwriting. | false | false | false |
| `check_secret_configuration` | Verify secret names, scopes, and locations without values. | true | false | false |
| `find_tool_capability` | Resolve a request to an available tool or exact blocker. | true | false | false |
| `bootstrap_workspace` | Create scoped workflow/build scaffolding. | false | false | false |
| `audit_build` | Inspect source, build output, media references, and secret leakage. | true | false | false |
| `deploy_and_save` | Deploy an audited build and save a verified version. | false | true | false |
| `replace_site_catalog_images` | Replace exact approved site/store media after snapshot. | false | true | true |

Each tool still needs an explicit input schema, output schema, authorization scope, side effects, and failure behavior before MCP review. Public MCP submission is blocked until the production endpoint, domain verification, authentication, five positive tests, three negative tests, and reviewer-ready access exist.
