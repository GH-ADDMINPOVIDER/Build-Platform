# Fastwork staging readiness

## Scope and evidence
- Preserve the four existing read-only tools; no execution adapter is introduced.
- Local E2E uses real MCP clients against standalone HTTP and actual Vercel handlers.
- The Vercel harness consumes JSON before dispatch to exercise parsed-body handling.
- That harness emulates rewrites; only remote verification checks deployed routing.
- Approval approve/deny/missing cases are test-only simulations, not human identity.
- Even simulated approval never authorizes execution or enables external effects.
- The dry run uses fictional fixture copy, with no recipients, secrets, or customer data.
- Remote checks make read-only requests; hosting access logs may still be written.
- Health success does not prove connector authentication or execution readiness.
- A remote test pass does not prove ChatGPT connection or successful widget rendering.

## Local verification
Use Node.js 22 and install dependencies from this app directory.
Run `npm test`; `npm run test:e2e` runs just the new E2E/dry-run harness.
The harness prints its fixture report only after assertions succeed for an endpoint.
Keep the command exit status and complete output; a partial PASS is not a suite pass.

## Vercel staging
1. Use a separate OGENIC staging project, never any Candy project or account resources.
2. Select this feature branch and root directory `apps/ogenic-control-tower`.
3. Use the existing `vercel.json`, Node.js 22, and a Preview deployment, not Production.
4. Inspect build/function logs and record the actual deployment URL and source SHA.
5. Set `OGENIC_STAGING_ORIGIN` to that HTTPS origin and run `npm run test:remote`.
6. Both `/mcp` and `/api/mcp`, plus all health aliases, must pass without redirects.
7. Deployment protection or auth failures are blockers, not successful MCP checks.

## ChatGPT acceptance (human-operated)
1. Confirm current developer-mode/custom-MCP availability and workspace permission.
2. This demo has no application authentication. Use no private data or write adapters.
3. Obtain explicit permission before exposing staging or changing access protection.
4. Add the verified HTTPS `/mcp` endpoint using the currently supported ChatGPT flow.
5. Invoke all four tools, route the fixture brief, and render the Control Tower widget.
6. Record actual connection/render results; connector surfaces must remain Unknown.
