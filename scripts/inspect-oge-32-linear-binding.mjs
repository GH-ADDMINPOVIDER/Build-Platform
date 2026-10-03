import { mkdir, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

// Metadata inspection only. Values remain on the GitHub-hosted runner and are
// neither persisted nor returned. Never inspect another environment's secrets.
export async function inspectLinearBinding(env, request = fetch) {
  const result = { environment: "staging", import_path: "/", recursive: true, infisical: { status: "READ_UNAVAILABLE", linear_binding_names: [] }, worker: { status: "READ_UNAVAILABLE", linear_binding_names: [] } };
  const json = async (url, init = {}) => {
    const response = await request(url, { ...init, redirect: "error", signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error("METADATA_READ_UNAVAILABLE");
    return response.json();
  };
  try {
    if (!env.ACTIONS_ID_TOKEN_REQUEST_URL || !env.ACTIONS_ID_TOKEN_REQUEST_TOKEN || !env.INFISICAL_PROJECT_ID) throw new Error("OIDC_UNAVAILABLE");
    const oidcUrl = new URL(env.ACTIONS_ID_TOKEN_REQUEST_URL);
    if (oidcUrl.protocol !== "https:" || !oidcUrl.hostname.endsWith(".actions.githubusercontent.com")) throw new Error("OIDC_URL_INVALID");
    const oidc = await json(oidcUrl.href, { headers: { Authorization: `Bearer ${env.ACTIONS_ID_TOKEN_REQUEST_TOKEN}` } });
    const login = await json("https://app.infisical.com/api/v1/auth/oidc-auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ identityId: env.INFISICAL_IDENTITY_ID, jwt: oidc.value, organizationSlug: env.INFISICAL_ORG_SLUG }) });
    if (!login.accessToken) throw new Error("OIDC_LOGIN_UNAVAILABLE");
    const url = new URL("https://app.infisical.com/api/v4/secrets");
    for (const [key, value] of Object.entries({ projectId: env.INFISICAL_PROJECT_ID, environment: "staging", secretPath: "/", recursive: "true", viewSecretValue: "false", expandSecretReferences: "false" })) url.searchParams.set(key, value);
    const metadata = await json(url.href, { headers: { Authorization: `Bearer ${login.accessToken}` } });
    if (!Array.isArray(metadata.secrets)) throw new Error("METADATA_SCHEMA_UNAVAILABLE");
    result.infisical = { status: "READ_AVAILABLE", linear_binding_names: metadata.secrets.filter(secret => /^LINEAR_[A-Z0-9_]{1,60}$/.test(secret.secretKey ?? "")).map(secret => ({ name: secret.secretKey, path: /^\/[A-Za-z0-9_./-]*$/.test(secret.secretPath ?? "/") ? secret.secretPath ?? "/" : "PATH_REDACTED" })) };
  } catch { /* Only the fixed availability status leaves this process. */ }
  try {
    if (!/^[a-f0-9]{32}$/i.test(env.CLOUDFLARE_ACCOUNT_ID ?? "") || !env.CLOUDFLARE_API_TOKEN) throw new Error("CLOUDFLARE_UNAVAILABLE");
    const settings = await json(`https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/workers/scripts/ogenic-phase-vi-staging/settings`, { headers: { Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}` } });
    if (!settings.success || !Array.isArray(settings.result?.bindings)) throw new Error("BINDING_METADATA_UNAVAILABLE");
    result.worker = { status: "READ_AVAILABLE", linear_binding_names: settings.result.bindings.filter(binding => /^LINEAR_[A-Z0-9_]{1,60}$/.test(binding.name ?? "")).map(binding => binding.name) };
  } catch { /* No remote error text or credential is logged. */ }
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const metadata = await inspectLinearBinding(process.env);
  await mkdir("oge-32-proof", { recursive: true });
  await writeFile("oge-32-proof/linear-binding-metadata.json", JSON.stringify(metadata, null, 2) + "\n", { mode: 0o600 });
  console.log("LINEAR_BINDING_METADATA_INSPECTION_FINISHED");
}
