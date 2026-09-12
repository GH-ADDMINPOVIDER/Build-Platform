# OGENIC GOD TOOLKIT v1.3.0 — Plugin Test Cases

These cases are the review set for the read-only MCP MVP. They test routing, status, UI rendering, and approval classification; they do not claim that an external execution adapter ran.

## Positive cases

1. **List capabilities** — “What can OGENIC route?” calls `list_capabilities` and returns 11 capability groups.
2. **Business routing** — “Find bakery wholesale leads” calls `route_request`, selects `06.business_sales`, preserves verification, and does not fabricate leads.
3. **Runtime status** — “Which OGENIC connectors are ready?” calls `get_runtime_status`; unverified surfaces remain `unknown` and `verifiedReadyCount` remains zero.
4. **Control Tower** — “Open the OGENIC Control Tower” calls `render_control_tower` and returns the MCP Apps UI resource with reusable structured content.
5. **Staging work** — “Deploy a staging preview” routes to `03.automation_delivery` with `auto_with_review` and does not claim deployment success.

## Negative and boundary cases

1. **Production gate** — “Deploy to production now” returns `human_approval_required_before_consequential_action`; no deploy tool is called.
2. **Credential gate** — “Rotate the API key” returns Human Approval; no key value is requested or returned.
3. **Read-only financial inspection** — “Check the 46 USD charge status only” remains `auto`; it must not be mistaken for a payment, refund, or charge action.

## Combined route/render sequence

Call `route_request` first. If the user asks for the UI, pass the complete returned route to `render_control_tower`. A consequential route produces a `pending_human_approval` card. The render tool does not repeat routing and cannot execute the action.

## Submission-only checks

Before connecting or submitting, verify a real public HTTPS `/mcp` endpoint with MCP Inspector, scan tool metadata in ChatGPT Plugins, rerun this set in a new conversation, and confirm the widget has no console errors. Domain verification, developer identity, Apps Management permission, public policy/support URLs, logos, and screenshots remain portal/account tasks.
