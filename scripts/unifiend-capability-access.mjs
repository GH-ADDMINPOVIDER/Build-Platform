import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inspectHostAccess } from "./unifiend-host-access.mjs";
import { reconcileCanonicalCheckpoint } from "./unifiend-checkpoint-access.mjs";

const REPOSITORY_ID = 1429580446;
const PRINCIPAL_ID = 342175560;
const BRANCH = "refs/heads/Unified-on-Progress";
const INFISICAL = "https://app.infisical.com";
const PROJECT_ID = "e8cfba67-ea99-4d79-bc9f-87b862f9129c";
const REFERENCES = ["GH_ADDMINPROVIDER-FINE_GRAINED"];

class ProbeFailure extends Error {
  constructor(stage, code, status = null) {
    super(code);
    this.stage = stage;
    this.code = code;
    this.status = status;
  }
}

async function jsonRequest(request, stage, url, init = {}) {
  let response;
  try {
    response = await request(url, { ...init, redirect: "manual", signal: AbortSignal.timeout(15000) });
  } catch {
    throw new ProbeFailure(stage, "TRANSPORT_FAILED");
  }
  if (!response.ok) {
    let code = response.status >= 300 && response.status < 400 ? "SERVICE_REDIRECT" : "HTTP_REJECTED";
    // Classify documented authentication failures without emitting their text,
    // which can contain sensitive claims or request details.
    const body = await response.json().catch(() => null);
    const message = typeof body?.message === "string" ? body.message.toLowerCase() : "";
    if (stage === "infisical_login") {
      for (const part of ["subject", "audience", "issuer", "claims", "identity"]) {
        if (message.includes(part)) { code = `AUTH_${part.toUpperCase()}_REJECTED`; break; }
      }
    }
    throw new ProbeFailure(stage, code, response.status);
  }
  try { return await response.json(); }
  catch { throw new ProbeFailure(stage, "INVALID_JSON"); }
}

function publicFailure(error) {
  return error instanceof ProbeFailure
    ? { stage: error.stage, code: error.code, http_status: error.status }
    : { stage: "probe", code: "UNEXPECTED_FAILURE", http_status: null };
}

function requiredString(value, stage) {
  if (typeof value !== "string" || !value || /[\r\n]/.test(value)) {
    throw new ProbeFailure(stage, "REQUIRED_VALUE_MISSING");
  }
  return value;
}

// Credentials stay inside this process. The optional administration check
// sends only the existing repository name, then independently reads it back.
export async function inspectCapabilityAccess({ env, request = fetch }) {
  const report = {
    schema: "UNIFIEND_CAPABILITY_ACCESS_V1",
    checked_at: new Date().toISOString(),
    repository_id: REPOSITORY_ID,
    principal_id: PRINCIPAL_ID,
    source_sha: /^[a-f0-9]{40}$/.test(env.GITHUB_SHA || "") ? env.GITHUB_SHA : null,
    operations: "READ_ONLY",
    ok: false,
    connection_references: [],
    credential_probes: [],
  };
  try {
    if (env.GITHUB_ACTIONS !== "true" || env.GITHUB_REPOSITORY_ID !== String(REPOSITORY_ID)
      || env.GITHUB_REPOSITORY_OWNER_ID !== String(PRINCIPAL_ID) || env.GITHUB_REF !== BRANCH) {
      throw new ProbeFailure("execution_scope", "CANONICAL_SCOPE_REQUIRED");
    }
    const identityId = requiredString(env.INFISICAL_IDENTITY_ID, "identity");
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(identityId)) throw new ProbeFailure("identity", "INVALID_IDENTITY_ID");
    const organizationSlug = requiredString(env.INFISICAL_ORG_SLUG, "organization");
    report.identity_id = identityId;
    const oidcUrl = new URL(requiredString(env.ACTIONS_ID_TOKEN_REQUEST_URL, "oidc_request"));
    if (oidcUrl.protocol !== "https:" || !oidcUrl.hostname.endsWith(".actions.githubusercontent.com")
      || oidcUrl.username || oidcUrl.password) throw new ProbeFailure("oidc_request", "UNTRUSTED_IDENTITY_ENDPOINT");
    const requestToken = requiredString(env.ACTIONS_ID_TOKEN_REQUEST_TOKEN, "oidc_request");
    const oidc = await jsonRequest(request, "oidc_request", oidcUrl.href, {
      headers: { Authorization: `Bearer ${requestToken}` },
    });
    const jwt = requiredString(oidc.value, "oidc_response");
    const login = await jsonRequest(request, "infisical_login", `${INFISICAL}/api/v1/auth/oidc-auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identityId, jwt, organizationSlug }),
    });
    const accessToken = requiredString(login.accessToken, "infisical_session");
    const infisicalHeaders = { Authorization: `Bearer ${accessToken}` };
    report.infisical_login = "VERIFIED";

    const query = new URLSearchParams({ projectId: PROJECT_ID, environment: "staging", secretPath: "/",
      recursive: "true", viewSecretValue: "false", expandSecretReferences: "false" });
    const metadata = await jsonRequest(request, "secret_metadata", `${INFISICAL}/api/v4/secrets?${query}`, {
      headers: infisicalHeaders,
    });
    if (!Array.isArray(metadata.secrets)) throw new ProbeFailure("secret_metadata", "INVALID_METADATA_SHAPE");
    const secrets = metadata.secrets.filter(s => s && typeof s.secretKey === "string"
      && /^[A-Za-z_][A-Za-z0-9_-]{0,127}$/.test(s.secretKey)
      && (s.secretPath == null || (typeof s.secretPath === "string" && /^\/[A-Za-z0-9_/-]*$/.test(s.secretPath))));
    report.available_references = secrets.slice(0, 250).map(s => ({ reference: s.secretKey, path: s.secretPath || "/" }));
    report.provider_credential_references = secrets.filter(s => /github|git_|^gh[0-9_-]|addmin|povider|provider/i.test(s.secretKey))
      .slice(0, 100).map(s => ({ reference: s.secretKey, path: s.secretPath || "/" }));
    report.connection_references = secrets.filter(s => /SSH|HOST|CODEX|TAILSCALE|TERMINAL|DIGITALOCEAN/i.test(s.secretKey))
      .slice(0, 100).map(s => ({ reference: s.secretKey, path: s.secretPath || "/" }));

    // Policy access is diagnostic only; never change its trust configuration.
    try {
      const policy = await jsonRequest(request, "oidc_policy", `${INFISICAL}/api/v1/auth/oidc-auth/identities/${identityId}`, {
        headers: infisicalHeaders,
      });
      const config = policy.identityOidcAuth ?? policy;
      const bindings = [config.boundSubject, config.boundAudiences, config.boundClaims];
      report.oidc_policy = {
        state: bindings.some(v => v != null) ? "READ_AVAILABLE" : "UNRECOGNIZED_RESPONSE",
        response_fields: Object.keys(policy).filter(k => /^[A-Za-z_][A-Za-z0-9_]{0,80}$/.test(k)),
        binding_fields: config && typeof config === "object" ? Object.keys(config).filter(k => /^bound[A-Za-z]+$/.test(k)) : [],
        current_repository_name_bound: JSON.stringify(bindings).includes("Build-Platform"),
        repository_id_bound: JSON.stringify(bindings).includes(String(REPOSITORY_ID)),
        subject_pattern: typeof config.boundSubject === "string" && /^[A-Za-z0-9_:*./% -]{0,250}$/.test(config.boundSubject) ? config.boundSubject : "UNREPORTED",
        claim_keys: config.boundClaims && typeof config.boundClaims === "object" ? Object.keys(config.boundClaims).filter(k => /^[A-Za-z0-9_]{1,80}$/.test(k)) : [],
      };
    } catch (error) { report.oidc_policy = { state: "READ_UNAVAILABLE", ...publicFailure(error) }; }

    for (const reference of REFERENCES) {
      const probe = { reference, state: "NOT_PRESENT" };
      report.credential_probes.push(probe);
      const matches = secrets.filter(s => s.secretKey === reference);
      if (!matches.length) continue;
      if (matches.length !== 1) { probe.state = "AMBIGUOUS_REFERENCE"; continue; }
      const secretQuery = new URLSearchParams({ projectId: PROJECT_ID, environment: "staging",
        secretPath: matches[0].secretPath || "/", type: "shared", viewSecretValue: "true", expandSecretReferences: "false" });
      try {
        const secret = await jsonRequest(request, "credential_resolution", `${INFISICAL}/api/v4/secrets/${encodeURIComponent(reference)}?${secretQuery}`, {
          headers: infisicalHeaders,
        });
        const token = requiredString(secret.secret?.secretValue, "credential_value");
        const headers = { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "Unifiend-capability-access" };
        const user = await jsonRequest(request, "provider_identity", "https://api.github.com/user", { headers });
        if (user.id !== PRINCIPAL_ID) throw new ProbeFailure("provider_identity", "OPERATIONAL_PRINCIPAL_MISMATCH");
        const repo = await jsonRequest(request, "repository_access", `https://api.github.com/repositories/${REPOSITORY_ID}`, { headers });
        if (repo.id !== REPOSITORY_ID || repo.owner?.id !== PRINCIPAL_ID) {
          throw new ProbeFailure("repository_access", "CANONICAL_REPOSITORY_MISMATCH");
        }
        probe.state = "VERIFIED_READ";
        probe.principal_id = user.id;
        probe.repository_id = repo.id;
        probe.repository_admin = repo.permissions?.admin === true;
        // A role flag does not establish Administration-write token permission.
        probe.administration_write = "NOT_TESTED";
        try {
          const machines = await jsonRequest(request, "host_registration", `https://api.github.com/repos/${repo.full_name}/actions/runners`, { headers });
          const existing = machines.runners?.filter(m => m.name === "wave-runner-01") || [];
          report.host_registration = { matching_count: existing.length, machines: existing.map(m => ({ id: m.id,
            status: ["online", "offline"].includes(m.status) ? m.status : "UNKNOWN", busy: m.busy === true })) };
        } catch (error) { report.host_registration = { state: "READ_UNAVAILABLE", ...publicFailure(error) }; }
        if (env.UNIFIEND_VERIFY_ADMIN_WRITE === "true") {
          report.operations = "READ_AND_UNCHANGED_NAME_ADMIN_PROBE";
          if (repo.full_name !== "Wave-Runner-2/Build-Platform" || repo.name !== "Build-Platform") {
            throw new ProbeFailure("administration_write", "CURRENT_NAME_CHANGED_REVIEW_REQUIRED");
          }
          const updated = await jsonRequest(request, "administration_write", `https://api.github.com/repos/${repo.full_name}`, {
            method: "PATCH", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ name: repo.name }),
          });
          const readback = await jsonRequest(request, "administration_readback", `https://api.github.com/repositories/${REPOSITORY_ID}`, { headers });
          if (updated.id !== REPOSITORY_ID || readback.id !== REPOSITORY_ID || readback.full_name !== repo.full_name) {
            throw new ProbeFailure("administration_readback", "UNCHANGED_REPOSITORY_NOT_VERIFIED");
          }
          probe.administration_write = "VERIFIED_UNCHANGED_NAME";
        }
      } catch (error) { probe.state = "BLOCKED"; probe.failure = publicFailure(error); }
    }
    report.ok = report.credential_probes.some(p => p.state === "VERIFIED_READ");
    const resolveSecret = async (reference) => {
      const matches = secrets.filter(s => s.secretKey === reference);
      if (matches.length !== 1) throw new ProbeFailure("secret_reference", "EXACT_REFERENCE_REQUIRED");
      const parameters = new URLSearchParams({ projectId: PROJECT_ID, environment: "staging", secretPath: matches[0].secretPath || "/",
        type: "shared", viewSecretValue: "true", expandSecretReferences: "false" });
      const resolved = await jsonRequest(request, "secret_reference", `${INFISICAL}/api/v4/secrets/${reference}?${parameters}`, { headers: infisicalHeaders });
      return resolved.secret?.secretValue;
    };
    if (env.UNIFIEND_INSPECT_HOST === "true") {
      try {
        const values = {};
        for (const reference of ["SSH_FINGER_PRINT_KEY", "SSH_PUBLIC_KEY", "SSH_PRIVATE_KEY"]) {
          values[reference] = await resolveSecret(reference);
        }
        report.host_access = inspectHostAccess({ saved: values.SSH_FINGER_PRINT_KEY, publicValue: values.SSH_PUBLIC_KEY, privateValue: values.SSH_PRIVATE_KEY });
      } catch (error) { report.host_access = { state: "BLOCKED", ...publicFailure(error) }; }
    }
    if (report.ok && env.UNIFIEND_RECORD_CHECKPOINT === "true") {
      report.operations = "READ_AND_EXISTING_TASK_CHECKPOINT";
      report.canonical_checkpoint = await reconcileCanonicalCheckpoint({ resolveSecret, request, evidence: report, runId: env.GITHUB_RUN_ID });
    }
  } catch (error) { report.failure = publicFailure(error); }
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = await inspectCapabilityAccess({ env: process.env });
  const path = resolve(".unifiend-reports/capability-access.json");
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(report, null, 2) + "\n");
  process.stdout.write(JSON.stringify(report) + "\n");
  process.exitCode = report.ok ? 0 : 1;
}
