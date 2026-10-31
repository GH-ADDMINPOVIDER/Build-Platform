import test from "node:test";
import assert from "node:assert/strict";
import { inspectCapabilityAccess } from "../scripts/unifiend-capability-access.mjs";

const env = {
  GITHUB_ACTIONS: "true",
  GITHUB_REPOSITORY_ID: "1429580446",
  GITHUB_REPOSITORY_OWNER_ID: "342175560",
  GITHUB_REF: "refs/heads/Unified-on-Progress",
  GITHUB_SHA: "a".repeat(40),
  INFISICAL_IDENTITY_ID: "b0962d69-bd33-4ac3-b4f4-48589535ca38",
  INFISICAL_ORG_SLUG: "ogenic-sio-r5-nd",
  ACTIONS_ID_TOKEN_REQUEST_URL: "https://pipelines.actions.githubusercontent.com/fixture/idtoken",
  ACTIONS_ID_TOKEN_REQUEST_TOKEN: "fixture-request-credential",
};
const fixture = {
  oidc: "fixture-oidc-credential",
  vault: "fixture-vault-credential",
  provider: "fixture-provider-credential",
};

function service(overrides = {}) {
  const calls = [];
  const request = async (url, init) => {
    calls.push({ url, method: init.method || "GET" });
    assert.equal(init.redirect, "manual");
    if (url.includes("/fixture/idtoken")) return Response.json({ value: fixture.oidc });
    if (url.endsWith("/oidc-auth/login")) {
      assert.deepEqual(JSON.parse(init.body), { identityId: env.INFISICAL_IDENTITY_ID,
        jwt: fixture.oidc, organizationSlug: env.INFISICAL_ORG_SLUG });
      return overrides.login?.() || Response.json({ accessToken: fixture.vault });
    }
    if (url.includes("/oidc-auth/identities/")) return overrides.policy?.() || Response.json({
      identityOidcAuth: { boundSubject: "repo:Wave-Runner-2/Build-Platform:*", boundClaims: { repository_id: "1429580446" } },
    });
    if (url.includes("/api/v4/secrets?")) {
      assert.equal(new URL(url).searchParams.get("viewSecretValue"), "false");
      return Response.json({ secrets: overrides.metadata || [
        { secretKey: "GH_ADDMINPROVIDER", secretPath: "/" },
        { secretKey: "SSH_PRIVATE_KEY", secretPath: "/host" },
      ] });
    }
    if (url.includes("/api/v4/secrets/GH_ADDMINPROVIDER?")) {
      assert.equal(init.headers.Authorization, `Bearer ${fixture.vault}`);
      return Response.json({ secret: { secretValue: fixture.provider } });
    }
    if (url === "https://api.github.com/user") {
      assert.equal(init.headers.Authorization, `Bearer ${fixture.provider}`);
      return overrides.user?.() || Response.json({ id: 342175560 });
    }
    if (url === "https://api.github.com/repositories/1429580446") {
      return Response.json({ id: 1429580446, owner: { id: 342175560 }, permissions: { admin: true } });
    }
    throw new Error("Unexpected fixture request");
  };
  return { request, calls };
}

test("capability probe fails before network access outside the exact Owner source scope", async () => {
  for (const patch of [{ GITHUB_REPOSITORY_ID: "1" }, { GITHUB_REPOSITORY_OWNER_ID: "306097555" },
    { GITHUB_REF: "refs/heads/main" }, { GITHUB_ACTIONS: "false" }]) {
    const s = service();
    const report = await inspectCapabilityAccess({ env: { ...env, ...patch }, request: s.request });
    assert.equal(report.failure.code, "CANONICAL_SCOPE_REQUIRED");
    assert.equal(s.calls.length, 0);
  }
});

test("identity request credentials cannot be sent to another endpoint", async () => {
  const s = service();
  const report = await inspectCapabilityAccess({ env: { ...env,
    ACTIONS_ID_TOKEN_REQUEST_URL: "https://actions.githubusercontent.com.attacker.test/idtoken" }, request: s.request });
  assert.equal(report.failure.code, "UNTRUSTED_IDENTITY_ENDPOINT");
  assert.equal(s.calls.length, 0);
});

test("existing OIDC and provider identity are verified with no administrative mutation or secret report", async () => {
  const s = service();
  const report = await inspectCapabilityAccess({ env, request: s.request });
  assert.equal(report.ok, true);
  assert.equal(report.credential_probes[0].principal_id, 342175560);
  assert.equal(report.credential_probes[0].repository_admin, true);
  assert.equal(report.credential_probes[0].administration_write, "NOT_TESTED");
  assert.deepEqual(report.connection_references, [{ reference: "SSH_PRIVATE_KEY", path: "/host" }]);
  assert.equal(report.oidc_policy.current_repository_name_bound, true);
  assert.equal(report.oidc_policy.repository_id_bound, true);
  assert.deepEqual(s.calls.filter(c => c.method !== "GET").map(c => new URL(c.url).pathname), ["/api/v1/auth/oidc-auth/login"]);
  assert.equal(s.calls.some(c => c.url.includes("/secrets/SSH_PRIVATE_KEY")), false);
  for (const value of Object.values(fixture)) assert.equal(JSON.stringify(report).includes(value), false);
});

test("an Infisical denial returns only its stage and status, never its body or credential", async () => {
  const s = service({ login: () => Response.json({ message: fixture.oidc }, { status: 403 }) });
  const report = await inspectCapabilityAccess({ env, request: s.request });
  assert.deepEqual(report.failure, { stage: "infisical_login", code: "HTTP_REJECTED", http_status: 403 });
  assert.equal(JSON.stringify(report).includes(fixture.oidc), false);
  assert.equal(s.calls.length, 2);
});

test("a credential for the archived principal cannot read the canonical repository", async () => {
  const s = service({ user: () => Response.json({ id: 306097555 }) });
  const report = await inspectCapabilityAccess({ env, request: s.request });
  assert.equal(report.ok, false);
  assert.equal(report.credential_probes[0].failure.code, "OPERATIONAL_PRINCIPAL_MISMATCH");
  assert.equal(s.calls.some(c => c.url.includes("/repositories/")), false);
});

test("ambiguous credential paths fail closed without guessing a secret", async () => {
  const s = service({ metadata: [{ secretKey: "GH_ADDMINPROVIDER", secretPath: "/" },
    { secretKey: "GH_ADDMINPROVIDER", secretPath: "/other" }] });
  const report = await inspectCapabilityAccess({ env, request: s.request });
  assert.equal(report.credential_probes[0].state, "AMBIGUOUS_REFERENCE");
  assert.equal(s.calls.some(c => c.url.includes("/secrets/GH_ADDMINPROVIDER?")), false);
});

test("unreadable trust policy is explicit and does not imply rename readiness", async () => {
  const s = service({ policy: () => Response.json({}, { status: 403 }) });
  const report = await inspectCapabilityAccess({ env, request: s.request });
  assert.equal(report.ok, true);
  assert.equal(report.oidc_policy.state, "READ_UNAVAILABLE");
  assert.equal(report.oidc_policy.http_status, 403);
  assert.equal(report.credential_probes[0].administration_write, "NOT_TESTED");
});

test("a rejected OIDC subject is classified without persisting the actual claims", async () => {
  const s = service({ login: () => Response.json({ message: `Subject mismatch: ${fixture.oidc}` }, { status: 401 }) });
  const report = await inspectCapabilityAccess({ env, request: s.request });
  assert.equal(report.failure.code, "AUTH_SUBJECT_REJECTED");
  assert.equal(JSON.stringify(report).includes(fixture.oidc), false);
});

test("reference inventory preserves existing mixed-case names without reading their values", async () => {
  const s = service({ metadata: [{ secretKey: "Api_GitHub_Primary", secretPath: "/" },
    { secretKey: "SSH_Private_Key", secretPath: "/host" }] });
  const report = await inspectCapabilityAccess({ env, request: s.request });
  assert.deepEqual(report.provider_credential_references, [{ reference: "Api_GitHub_Primary", path: "/" }]);
  assert.deepEqual(report.connection_references, [{ reference: "SSH_Private_Key", path: "/host" }]);
  assert.equal(s.calls.some(c => /\/secrets\/[^?]+\?/.test(c.url)), false);
});
