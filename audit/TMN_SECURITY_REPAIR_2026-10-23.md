# TMN / Connector Security Remediation Evidence — 2026-10-23

Scope: `apps/ogenic-control-tower` in GH2 `Wave-Runner-2/Build-Platform`, repair branch `fix/tmn-docker-cach-security-20261023`. Staging only, not Production.

## Observed dependency facts
- Before fix (`main` package-lock): `@modelcontextprotocol/sdk 1.30.0`, `proxy-addr 2.0.7`.
- After fix (repair branch package-lock readback): `@modelcontextprotocol/sdk 1.32.1`, `proxy-addr 2.0.8`.
- `TMN lockfile reconcile` GitHub Actions run **39919650581**: successful. GitHub lockfile update commit observed: `d9c38c039ebfae13e8f6872b16d15d1fbc7c4d8c`.
- Original workflow `OGENIC Toolkit Validate` on stale SHA (run **39919171985**) failed at `npm ci` because the package manifest was advanced before its lockfile; that is not a runtime regression in the protected `main`.
- Audit/Bundle run **39919172229** on previous staging branch SHA passed; unrelated status does not prove MCP security acceptance.

## Advisory sources
- proxy-addr: `GHSA-jqcg-44mw-7w3h`, fix >=2.0.8.
- MCP SDK OAuth credential issuer: `GHSA-6qxp-vccf-f47h`, fix >=1.31.0 for 1.x.
- MCP SDK malicious input validation OOM: `GHSA-46jr-4wx8-v453`, fix >=1.32.0.
- MCP SDK cross-origin HTTP redirect risk: `GHSA-6prh-2h8m-c8cw`, fix >=1.32.0 for 1.x.

## Acceptance gates
1. GH2 PR build and smoke tests on **the repaired lockfile SHA** must PASS.
2. Restricted Docker audit script must complete and capture real package scan outcome, with no remaining actionable High/Critical vulnerabilities for this scoped dependency tree.
3. WAVE/TMN/Terminal SOLO → Docker → OCIAN-S HOST → D1 E2E still requires signed Owner/Yellowstone policy and independent runtime receipt.
4. `CaCH Context Design` migration from `RP_STORE(OLD)` requires a new GH2 repository and Git mirror. This branch only records a pinned read-only Store source and does not assert a full mirror.

Append-only scoped evidence; do not modify historical certificate receipts or GREEN/ORANGE status.
