import { hasOwnerSession, type AuthBindings } from "./app-auth";

type D1Result<T = Record<string, unknown>> = { results?: T[] };
type D1Prepared = {
  bind: (...values: unknown[]) => D1Prepared;
  all: <T = Record<string, unknown>>() => Promise<D1Result<T>>;
  first: <T = Record<string, unknown>>() => Promise<T | null>;
  run: () => Promise<unknown>;
};
type D1 = { prepare: (query: string) => D1Prepared };

export type WaveMcpOAuthBindings = AuthBindings & {
  DB?: D1;
  OGENIC_GIT_SHA?: string;
  OGENIC_GITHUB_BRANCH?: string;
  OGENIC_BUILD_UUID?: string;
  OGENIC_PHASE?: string;
  OGENIC_RUNTIME?: string;
};

type ClientRow = {
  client_id: string;
  client_name: string;
  redirect_uris_json: string;
  grant_types_json: string;
  response_types_json: string;
  token_endpoint_auth_method: string;
  client_uri: string | null;
  created_at: number;
};

type OAuthClient = {
  client_id: string;
  client_name: string;
  redirect_uris: string[];
  grant_types: string[];
  response_types: string[];
  token_endpoint_auth_method: "none";
  client_uri?: string;
  is_cimd: boolean;
};

type AuthorizeParams = {
  response_type: string;
  client_id: string;
  redirect_uri: string;
  scope: string;
  state: string;
  code_challenge: string;
  code_challenge_method: string;
  resource: string;
};

const ISSUER = "https://wave.ogenicchocolate.com";
const RESOURCE = "https://wave.ogenicchocolate.com/mcp";
const RESOURCE_METADATA = `${ISSUER}/.well-known/oauth-protected-resource/mcp`;
const AUTHORIZATION_ENDPOINT = `${ISSUER}/oauth/authorize`;
const TOKEN_ENDPOINT = `${ISSUER}/oauth/token`;
const REGISTRATION_ENDPOINT = `${ISSUER}/oauth/register`;
const REVOCATION_ENDPOINT = `${ISSUER}/oauth/revoke`;
const SUPPORTED_SCOPES = new Set(["ogenic:read", "ogenic:sessions:read"]);
const DEFAULT_SCOPE = "ogenic:read ogenic:sessions:read";
const ACCESS_TOKEN_TTL_SECONDS = 900;
const REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30;
const AUTH_CODE_TTL_MS = 90_000;
const MAX_REGISTRATION_BYTES = 16 * 1024;
const OAUTH_CLIENT_URL = /^https:\/\/chatgpt\.com\/oauth\/(?:[A-Za-z0-9_-]+\/)?client\.json$/;

const clean = (value: unknown, max = 500) => String(value ?? "").trim().slice(0, max);
const randomBytes = (length: number) => crypto.getRandomValues(new Uint8Array(length));

function b64url(bytes: Uint8Array) {
  let raw = "";
  for (const byte of bytes) raw += String.fromCharCode(byte);
  return btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function safeEqual(left: string, right: string) {
  const encoder = new TextEncoder();
  return Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(left)),
    crypto.subtle.digest("SHA-256", encoder.encode(right)),
  ]).then(([a, b]) => {
    const aa = new Uint8Array(a);
    const bb = new Uint8Array(b);
    let diff = 0;
    for (let index = 0; index < aa.length; index += 1) diff |= aa[index] ^ bb[index];
    return diff === 0;
  });
}

async function sha256(value: string) {
  return b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))));
}

function noStore(headers: HeadersInit = {}) {
  const result = new Headers(headers);
  result.set("Cache-Control", "no-store");
  result.set("Pragma", "no-cache");
  result.set("X-Content-Type-Options", "nosniff");
  result.set("Referrer-Policy", "no-referrer");
  return result;
}

function json(body: unknown, status = 200, headers: HeadersInit = {}) {
  const finalHeaders = noStore(headers);
  finalHeaders.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(body), { status, headers: finalHeaders });
}

function html(body: string, status = 200) {
  return new Response(body, {
    status,
    headers: noStore({
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
    }),
  });
}

function escapeHtml(value: unknown) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char] ?? char);
}

function allowedRedirectUri(value: unknown): string | null {
  const raw = clean(value, 1800);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password || url.hash) return null;
    if (url.hostname.toLowerCase() === "wave.ogenicchocolate.com") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function safeClientUri(value: unknown): string | undefined {
  const raw = clean(value, 1200);
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password) return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

function parseStringArray(value: unknown, max = 10): string[] {
  if (!Array.isArray(value) || value.length > max) return [];
  return value.filter((item): item is string => typeof item === "string").map((item) => clean(item, 1800));
}

function parseClientRow(row: ClientRow): OAuthClient | null {
  try {
    const redirect_uris = parseStringArray(JSON.parse(row.redirect_uris_json));
    const grant_types = parseStringArray(JSON.parse(row.grant_types_json), 4);
    const response_types = parseStringArray(JSON.parse(row.response_types_json), 4);
    if (!redirect_uris.length || !redirect_uris.every((item) => allowedRedirectUri(item) === item)) return null;
    if (!grant_types.includes("authorization_code") || !response_types.includes("code")) return null;
    if (row.token_endpoint_auth_method !== "none") return null;
    return {
      client_id: row.client_id,
      client_name: clean(row.client_name, 120) || "MCP client",
      redirect_uris,
      grant_types,
      response_types,
      token_endpoint_auth_method: "none",
      client_uri: row.client_uri || undefined,
      is_cimd: false,
    };
  } catch {
    return null;
  }
}

async function resolveClient(env: WaveMcpOAuthBindings, clientId: string): Promise<OAuthClient | null> {
  if (!clientId || clientId.length > 1800) return null;
  if (OAUTH_CLIENT_URL.test(clientId)) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4000);
      let response: Response;
      try {
        response = await fetch(clientId, {
          headers: { Accept: "application/json" },
          redirect: "error",
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }
      if (!response.ok) return null;
      const raw = await response.text();
      if (raw.length > 32 * 1024) return null;
      const metadata = JSON.parse(raw) as Record<string, unknown>;
      if (metadata.client_id !== clientId) return null;
      const redirect_uris = parseStringArray(metadata.redirect_uris);
      if (!redirect_uris.length || !redirect_uris.every((uri) => Boolean(allowedRedirectUri(uri)))) return null;
      const methods = parseStringArray(metadata.token_endpoint_auth_methods_supported ?? [metadata.token_endpoint_auth_method], 4);
      if (methods.length && !methods.includes("none")) return null;
      return {
        client_id: clientId,
        client_name: clean(metadata.client_name, 120) || "ChatGPT",
        redirect_uris,
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
        client_uri: safeClientUri(metadata.client_uri),
        is_cimd: true,
      };
    } catch {
      return null;
    }
  }

  if (!env.DB) return null;
  try {
    const row = await env.DB.prepare(
      "SELECT client_id, client_name, redirect_uris_json, grant_types_json, response_types_json, token_endpoint_auth_method, client_uri, created_at FROM mcp_oauth_clients WHERE client_id = ? LIMIT 1",
    ).bind(clientId).first<ClientRow>();
    return row ? parseClientRow(row) : null;
  } catch {
    return null;
  }
}

function scopeList(scope: string): string[] | null {
  const scopes = [...new Set(scope.split(/\s+/).filter(Boolean))];
  if (!scopes.length || scopes.some((item) => !SUPPORTED_SCOPES.has(item))) return null;
  if (!scopes.includes("ogenic:read")) return null;
  return scopes.sort();
}

function oauthMetadata() {
  return {
    issuer: ISSUER,
    authorization_endpoint: AUTHORIZATION_ENDPOINT,
    token_endpoint: TOKEN_ENDPOINT,
    registration_endpoint: REGISTRATION_ENDPOINT,
    revocation_endpoint: REVOCATION_ENDPOINT,
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    token_endpoint_auth_methods_supported: ["none"],
    code_challenge_methods_supported: ["S256"],
    scopes_supported: [...SUPPORTED_SCOPES],
    client_id_metadata_document_supported: true,
    authorization_response_iss_parameter_supported: true,
    service_documentation: `${ISSUER}/docs/integrations/WAVE_REMOTE_MCP_DATA_STONE.md`,
  };
}

function protectedResourceMetadata() {
  return {
    resource: RESOURCE,
    authorization_servers: [ISSUER],
    scopes_supported: [...SUPPORTED_SCOPES],
    bearer_methods_supported: ["header"],
    resource_documentation: `${ISSUER}/docs/integrations/WAVE_REMOTE_MCP_DATA_STONE.md`,
  };
}

function loginPage() {
  return html(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sign in to OGENIC WAVE</title><style>body{font:16px system-ui;background:#111827;color:#f9fafb;margin:0;min-height:100vh;display:grid;place-items:center}.card{max-width:430px;margin:20px;background:#1f2937;border:1px solid #374151;border-radius:18px;padding:26px}h1{font-size:24px}p{color:#d1d5db;line-height:1.5}input,button{box-sizing:border-box;width:100%;padding:13px;border-radius:10px;margin-top:10px}input{background:#111827;color:#fff;border:1px solid #4b5563}button{background:#f9fafb;color:#111827;font-weight:700;border:0;cursor:pointer}.error{color:#fca5a5;min-height:1.3em}</style><main class="card"><p>OGENIC · OWNER SIGN-IN</p><h1>Sign in to connect OGE Athena</h1><p>Use your existing WAVE owner access. Your key is sent only to this site's existing session endpoint and is not stored by the MCP connector.</p><form id="signin"><label for="key">WAVE owner access key</label><input id="key" type="password" autocomplete="current-password" required autofocus><button id="submit" type="submit">Sign in and continue</button><p id="error" class="error" role="status"></p></form></main><script>const form=document.getElementById('signin');form.addEventListener('submit',async e=>{e.preventDefault();const key=document.getElementById('key');const button=document.getElementById('submit');const error=document.getElementById('error');button.disabled=true;error.textContent='Checking owner session…';try{const r=await fetch('/api/session',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({owner_key:key.value})});const b=await r.json().catch(()=>({}));if(!r.ok||!b.authenticated)throw new Error(b.code||'SIGN_IN_FAILED');key.value='';location.reload()}catch(cause){error.textContent=cause instanceof Error?cause.message:'SIGN_IN_FAILED';button.disabled=false}});</script></html>`);
}

function consentPage(params: AuthorizeParams, clientName: string) {
  const fields = Object.entries(params).map(([key, value]) =>
    `<input type="hidden" name="${escapeHtml(key)}" value="${escapeHtml(value)}">`,
  ).join("");
  return html(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Connect OGE Athena</title><style>body{font:16px system-ui;background:#111827;color:#f9fafb;margin:0;min-height:100vh;display:grid;place-items:center}.card{max-width:500px;margin:20px;background:#1f2937;border:1px solid #374151;border-radius:18px;padding:26px}h1{font-size:24px}p,li{color:#d1d5db;line-height:1.5}.scope{background:#111827;border:1px solid #374151;padding:12px;border-radius:10px;margin:12px 0}button{padding:13px 18px;border-radius:10px;border:0;font-weight:700;cursor:pointer;margin:8px 8px 0 0}.allow{background:#f9fafb;color:#111827}.deny{background:#374151;color:#fff}</style><main class="card"><p>OGENIC · OWNER CONSENT</p><h1>Connect OGE Athena</h1><p><strong>${escapeHtml(clientName)}</strong> requests access to your existing WAVE staging system.</p><div class="scope"><strong>Read-only access requested</strong><ul><li>Worker version and D1 table health</li><li>Declared Agent capabilities and integration status</li><li>Existing owner-main session references</li></ul></div><p>No workflow execution, writes, deployments, raw credentials, or message-body export is granted by this connector. Yellow Stone remains the execution authority.</p><form method="post" action="/oauth/authorize">${fields}<button class="allow" type="submit" name="decision" value="approve">Connect OGE Athena</button><button class="deny" type="submit" name="decision" value="deny">Cancel</button></form></main></html>`);
}

function errorRedirect(params: AuthorizeParams, error: string, description: string, status = 302) {
  const target = new URL(params.redirect_uri);
  target.searchParams.set("error", error);
  target.searchParams.set("error_description", description.slice(0, 200));
  target.searchParams.set("state", params.state);
  target.searchParams.set("iss", ISSUER);
  return Response.redirect(target.toString(), status);
}

function readAuthorizeParams(source: URLSearchParams): AuthorizeParams | null {
  const params: AuthorizeParams = {
    response_type: clean(source.get("response_type"), 20),
    client_id: clean(source.get("client_id"), 1800),
    redirect_uri: clean(source.get("redirect_uri"), 1800),
    scope: clean(source.get("scope"), 500) || DEFAULT_SCOPE,
    state: clean(source.get("state"), 500),
    code_challenge: clean(source.get("code_challenge"), 160),
    code_challenge_method: clean(source.get("code_challenge_method"), 20),
    resource: clean(source.get("resource"), 1800),
  };
  if (
    params.response_type !== "code" ||
    !params.client_id ||
    !allowedRedirectUri(params.redirect_uri) ||
    !params.state ||
    params.code_challenge_method !== "S256" ||
    !/^[A-Za-z0-9_-]{43,128}$/.test(params.code_challenge) ||
    params.resource !== RESOURCE ||
    !scopeList(params.scope)
  ) return null;
  return params;
}

async function dcr(request: Request, env: WaveMcpOAuthBindings) {
  if (!env.DB) return json({ error: "server_error", error_description: "OAuth client registry requires the existing D1 binding." }, 503);
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_REGISTRATION_BYTES) return json({ error: "invalid_client_metadata" }, 413);
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_REGISTRATION_BYTES) return json({ error: "invalid_client_metadata" }, 413);
  let body: Record<string, unknown>;
  try { body = JSON.parse(raw) as Record<string, unknown>; }
  catch { return json({ error: "invalid_client_metadata" }, 400); }

  const client_name = clean(body.client_name, 120);
  const redirect_uris = parseStringArray(body.redirect_uris);
  const grant_types = parseStringArray(body.grant_types ?? ["authorization_code", "refresh_token"], 4);
  const response_types = parseStringArray(body.response_types ?? ["code"], 4);
  const authMethod = clean(body.token_endpoint_auth_method ?? "none", 40);
  const client_uri = safeClientUri(body.client_uri);

  if (!client_name || !redirect_uris.length || !redirect_uris.every((uri) => Boolean(allowedRedirectUri(uri))) ||
      !grant_types.includes("authorization_code") || grant_types.some((grant) => !["authorization_code", "refresh_token"].includes(grant)) ||
      !response_types.includes("code") || response_types.some((type) => type !== "code") || authMethod !== "none") {
    return json({ error: "invalid_client_metadata", error_description: "Use HTTPS redirect URIs, response_type=code, authorization_code/refresh_token, and token_endpoint_auth_method=none." }, 400);
  }

  const client_id = `oge_${b64url(randomBytes(24))}`;
  const now = Date.now();
  try {
    await env.DB.prepare(
      "INSERT INTO mcp_oauth_clients(client_id, client_name, redirect_uris_json, grant_types_json, response_types_json, token_endpoint_auth_method, client_uri, created_at) VALUES (?, ?, ?, ?, ?, 'none', ?, ?)",
    ).bind(client_id, client_name, JSON.stringify(redirect_uris), JSON.stringify(grant_types), JSON.stringify(response_types), client_uri ?? null, now).run();
  } catch {
    return json({ error: "server_error", error_description: "Client registration could not be persisted." }, 503);
  }

  return json({
    client_id,
    client_id_issued_at: Math.floor(now / 1000),
    client_name,
    redirect_uris,
    grant_types,
    response_types,
    token_endpoint_auth_method: "none",
    scope: DEFAULT_SCOPE,
    client_uri,
  }, 201);
}

async function authorize(request: Request, env: WaveMcpOAuthBindings) {
  if (!env.DB) return json({ error: "server_error", error_description: "The existing D1 binding is unavailable." }, 503);
  let rawParams: URLSearchParams;
  let decisionInput = "";
  if (request.method === "GET") {
    rawParams = new URL(request.url).searchParams;
  } else if (request.method === "POST") {
    const form = await request.formData().catch(() => null);
    rawParams = new URLSearchParams();
    if (form) {
      for (const key of ["response_type", "client_id", "redirect_uri", "scope", "state", "code_challenge", "code_challenge_method", "resource"]) {
        const value = form.get(key);
        if (typeof value === "string") rawParams.set(key, value);
      }
      const decision = clean(form.get("decision"), 20);
      decisionInput = decision;
      if (decision !== "approve" && decision !== "deny") {
        return json({ error: "invalid_request", error_description: "A clear owner consent decision is required." }, 400);
      }
    } else {
      return json({ error: "invalid_request" }, 400);
    }
  } else {
    return json({ error: "unsupported_method" }, 405, { Allow: "GET, POST" });
  }

  const params = readAuthorizeParams(rawParams);
  if (!params) return json({ error: "invalid_request", error_description: "Invalid OAuth authorization request or unsupported scope/resource/PKCE method." }, 400);

  const client = await resolveClient(env, params.client_id);
  if (!client || !client.redirect_uris.includes(params.redirect_uri)) {
    return json({ error: "invalid_client", error_description: "Client identity or redirect URI is not registered." }, 400);
  }
  if (!client.grant_types.includes("authorization_code") || !client.response_types.includes("code")) {
    return json({ error: "unauthorized_client" }, 400);
  }
  if (request.method === "POST" && decisionInput === "deny") {
    return errorRedirect(params, "access_denied", "Owner cancelled the connection.");
  }

  if (!(await hasOwnerSession(request, env))) return loginPage();

  if (request.method === "GET") return consentPage(params, client.client_name);
  if (!params.scope) return json({ error: "invalid_scope" }, 400);

  if (decisionInput !== "approve") {
    return json({ error: "invalid_request", error_description: "Owner consent is missing." }, 400);
  }
  const code = b64url(randomBytes(32));
  const codeHash = await sha256(code);
  const now = Date.now();
  try {
    await env.DB.prepare(
      "INSERT INTO mcp_oauth_authorization_codes(code_hash, client_id, redirect_uri, resource, code_challenge, scope, owner_id, expires_at, consumed_at, created_at) VALUES (?, ?, ?, ?, ?, ?, 'ogenic-owner', ?, NULL, ?)",
    ).bind(codeHash, params.client_id, params.redirect_uri, params.resource, params.code_challenge, params.scope, now + AUTH_CODE_TTL_MS, now).run();
  } catch {
    return json({ error: "server_error", error_description: "Authorization code could not be issued." }, 503);
  }

  const redirect = new URL(params.redirect_uri);
  redirect.searchParams.set("code", code);
  redirect.searchParams.set("state", params.state);
  redirect.searchParams.set("iss", ISSUER);
  return Response.redirect(redirect.toString(), 302);
}

function oauthError(error: string, description: string, status = 400) {
  return json({ error, error_description: description.slice(0, 220) }, status, { "Cache-Control": "no-store" });
}

async function storeToken(
  env: WaveMcpOAuthBindings,
  clientId: string,
  scope: string,
  tokenType: "access" | "refresh",
  ttlSeconds: number,
) {
  if (!env.DB) throw new Error("D1_UNBOUND");
  const token = b64url(randomBytes(32));
  const tokenHash = await sha256(token);
  const now = Date.now();
  await env.DB.prepare(
    "INSERT INTO mcp_oauth_tokens(token_hash, client_id, owner_id, resource, scope, token_type, expires_at, revoked_at, created_at) VALUES (?, ?, 'ogenic-owner', ?, ?, ?, ?, NULL, ?)",
  ).bind(tokenHash, clientId, RESOURCE, scope, tokenType, now + ttlSeconds * 1000, now).run();
  return token;
}

async function tokenEndpoint(request: Request, env: WaveMcpOAuthBindings) {
  if (request.method !== "POST") return oauthError("invalid_request", "POST required.", 405);
  if (!env.DB) return oauthError("server_error", "The existing D1 binding is unavailable.", 503);
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > 24 * 1024) return oauthError("invalid_request", "Request too large.", 413);
  const form = await request.formData().catch(() => null);
  if (!form) return oauthError("invalid_request", "Use application/x-www-form-urlencoded.");

  const grant = clean(form.get("grant_type"), 80);
  const clientId = clean(form.get("client_id"), 1800);
  const resource = clean(form.get("resource"), 1800);
  if (!clientId || resource !== RESOURCE) return oauthError("invalid_request", "client_id and the registered resource are required.");
  if (form.get("client_secret") || form.get("client_assertion")) return oauthError("invalid_client", "This public-client server accepts only token_endpoint_auth_method=none.");

  let client: OAuthClient | null = null;
  try { client = await resolveClient(env, clientId); } catch { client = null; }
  if (!client) return oauthError("invalid_client", "Unknown OAuth client.");

  try {
    if (grant === "authorization_code") {
      const code = clean(form.get("code"), 300);
      const redirectUri = clean(form.get("redirect_uri"), 1800);
      const verifier = clean(form.get("code_verifier"), 200);
      if (!code || !verifier || !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier) || !client.redirect_uris.includes(redirectUri)) {
        return oauthError("invalid_grant", "Authorization code, redirect URI, or PKCE verifier is invalid.");
      }
      const codeHash = await sha256(code);
      const row = await env.DB.prepare(
        "SELECT code_hash, client_id, redirect_uri, resource, code_challenge, scope, owner_id, expires_at, consumed_at FROM mcp_oauth_authorization_codes WHERE code_hash = ? LIMIT 1",
      ).bind(codeHash).first<Record<string, unknown>>();
      if (!row || row.client_id !== clientId || row.redirect_uri !== redirectUri || row.resource !== resource ||
          Number(row.expires_at) <= Date.now() || row.consumed_at != null) {
        return oauthError("invalid_grant", "Authorization code expired, was already used, or does not match this client/resource.");
      }
      const calculatedChallenge = await sha256(verifier);
      if (!(await safeEqual(String(row.code_challenge), calculatedChallenge))) {
        return oauthError("invalid_grant", "PKCE verification failed.");
      }
      const consumed = await env.DB.prepare(
        "UPDATE mcp_oauth_authorization_codes SET consumed_at = ? WHERE code_hash = ? AND consumed_at IS NULL AND expires_at > ? AND client_id = ? RETURNING code_hash",
      ).bind(Date.now(), codeHash, Date.now(), clientId).first<{ code_hash: string }>();
      if (!consumed) return oauthError("invalid_grant", "Authorization code was already consumed.");
      const scopes = scopeList(String(row.scope));
      if (!scopes) return oauthError("invalid_scope", "Authorization code contains unsupported scopes.");
      const scope = scopes.join(" ");
      const access_token = await storeToken(env, clientId, scope, "access", ACCESS_TOKEN_TTL_SECONDS);
      const refresh_token = await storeToken(env, clientId, scope, "refresh", REFRESH_TOKEN_TTL_SECONDS);
      return json({
        access_token,
        token_type: "Bearer",
        expires_in: ACCESS_TOKEN_TTL_SECONDS,
        refresh_token,
        scope,
      });
    }

    if (grant === "refresh_token") {
      const refreshToken = clean(form.get("refresh_token"), 500);
      const scopeParam = clean(form.get("scope"), 500);
      if (!refreshToken) return oauthError("invalid_request", "refresh_token is required.");
      const refreshHash = await sha256(refreshToken);
      const row = await env.DB.prepare(
        "SELECT token_hash, client_id, owner_id, resource, scope, token_type, expires_at, revoked_at FROM mcp_oauth_tokens WHERE token_hash = ? AND token_type = 'refresh' LIMIT 1",
      ).bind(refreshHash).first<Record<string, unknown>>();
      if (!row || row.client_id !== clientId || row.resource !== RESOURCE || Number(row.expires_at) <= Date.now() || row.revoked_at != null) {
        return oauthError("invalid_grant", "Refresh token expired, was revoked, or belongs to another client.");
      }
      const oldScopes = scopeList(String(row.scope));
      const requestedScopes = scopeParam ? scopeList(scopeParam) : oldScopes;
      if (!oldScopes || !requestedScopes || requestedScopes.some((scope) => !oldScopes.includes(scope))) {
        return oauthError("invalid_scope", "A refresh request cannot expand the existing grant.");
      }
      const revoked = await env.DB.prepare(
        "UPDATE mcp_oauth_tokens SET revoked_at = ? WHERE token_hash = ? AND token_type = 'refresh' AND revoked_at IS NULL AND expires_at > ? RETURNING token_hash",
      ).bind(Date.now(), refreshHash, Date.now()).first<{ token_hash: string }>();
      if (!revoked) return oauthError("invalid_grant", "Refresh token was already rotated.");
      const scope = requestedScopes.join(" ");
      const access_token = await storeToken(env, clientId, scope, "access", ACCESS_TOKEN_TTL_SECONDS);
      const refresh_token = await storeToken(env, clientId, scope, "refresh", REFRESH_TOKEN_TTL_SECONDS);
      return json({ access_token, token_type: "Bearer", expires_in: ACCESS_TOKEN_TTL_SECONDS, refresh_token, scope });
    }

    return oauthError("unsupported_grant_type", "Only authorization_code and refresh_token are supported.");
  } catch {
    return oauthError("server_error", "Token exchange failed safely.", 503);
  }
}

async function revoke(request: Request, env: WaveMcpOAuthBindings) {
  if (request.method !== "POST") return oauthError("invalid_request", "POST required.", 405);
  if (!env.DB) return oauthError("server_error", "The existing D1 binding is unavailable.", 503);
  const form = await request.formData().catch(() => null);
  if (!form) return oauthError("invalid_request", "Use application/x-www-form-urlencoded.");
  const token = clean(form.get("token"), 500);
  const clientId = clean(form.get("client_id"), 1800);
  if (token && clientId) {
    try {
      const tokenHash = await sha256(token);
      await env.DB.prepare(
        "UPDATE mcp_oauth_tokens SET revoked_at = ? WHERE token_hash = ? AND client_id = ? AND revoked_at IS NULL",
      ).bind(Date.now(), tokenHash, clientId).run();
    } catch {
      // RFC 7009 deliberately avoids disclosing token validity to the caller.
    }
  }
  return json({}, 200);
}

export async function verifyMcpAccessToken(request: Request, env: WaveMcpOAuthBindings) {
  const match = /^Bearer\s+(.+)$/i.exec(request.headers.get("authorization") ?? "");
  if (!match) return { ok: false as const, reason: "missing_token" as const, scopes: [] as string[] };
  if (!env.DB) return { ok: false as const, reason: "d1_unavailable" as const, scopes: [] as string[] };
  try {
    const tokenHash = await sha256(match[1].trim());
    const row = await env.DB.prepare(
      "SELECT token_hash, client_id, owner_id, resource, scope, token_type, expires_at, revoked_at FROM mcp_oauth_tokens WHERE token_hash = ? AND token_type = 'access' LIMIT 1",
    ).bind(tokenHash).first<Record<string, unknown>>();
    if (!row || row.resource !== RESOURCE || Number(row.expires_at) <= Date.now() || row.revoked_at != null) {
      return { ok: false as const, reason: "invalid_token" as const, scopes: [] as string[] };
    }
    const scopes = scopeList(String(row.scope));
    if (!scopes) return { ok: false as const, reason: "invalid_scope" as const, scopes: [] as string[] };
    return { ok: true as const, scopes };
  } catch {
    return { ok: false as const, reason: "d1_unavailable" as const, scopes: [] as string[] };
  }
}

export function isWaveOAuthPath(pathname: string) {
  return pathname === "/.well-known/oauth-protected-resource" ||
    pathname === "/.well-known/oauth-protected-resource/mcp" ||
    pathname === "/.well-known/oauth-authorization-server" ||
    pathname === "/oauth/authorize" ||
    pathname === "/oauth/token" ||
    pathname === "/oauth/register" ||
    pathname === "/oauth/revoke";
}

export async function handleWaveOAuth(request: Request, env: WaveMcpOAuthBindings): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: noStore({
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
      "Access-Control-Max-Age": "600",
    }) });
  }
  if (path === "/.well-known/oauth-protected-resource" || path === "/.well-known/oauth-protected-resource/mcp") {
    return json(protectedResourceMetadata(), 200, { "Access-Control-Allow-Origin": "*" });
  }
  if (path === "/.well-known/oauth-authorization-server") {
    return json(oauthMetadata(), 200, { "Access-Control-Allow-Origin": "*" });
  }
  if (path === "/oauth/register") {
    if (request.method !== "POST") return json({ error: "invalid_request", error_description: "POST required." }, 405, { Allow: "POST, OPTIONS" });
    return dcr(request, env);
  }
  if (path === "/oauth/authorize") return authorize(request, env);
  if (path === "/oauth/token") return tokenEndpoint(request, env);
  if (path === "/oauth/revoke") return revoke(request, env);
  return json({ error: "not_found" }, 404);
}
