import { hasOwnerSession, type AuthBindings } from "./app-auth";

// WF-003: independent WAVE identities. ChatGPT Go is never an auth credential.
// Enabling requires both a real Cloudflare Access application and D1 migration 0016.
export type DbStmt = {
  bind(...items: unknown[]): DbStmt;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results?: T[] }>;
  run(): Promise<{ meta?: { changes?: number } }>;
};
export type FabricDb = {
  prepare(sql: string): DbStmt;
  batch(statements: DbStmt[]): Promise<unknown[]>;
};
export type FabricEnv = AuthBindings & {
  DB?: FabricDb;
  WAVE_AGENT_FABRIC_ENABLED?: string;
  WAVE_ACCESS_ISSUER?: string;
  WAVE_ACCESS_AUD?: string;
};
export type FabricActor = { principalId: string; kind: "HUMAN" | "RUNTIME"; tokenHash: string };
export class FabricError extends Error {
  constructor(public status: number, public code: string) { super(code); }
}
const cookieName = "__Host-wave_fabric";
const sessionLifeMs = 15 * 60_000;

export function requireFabricDb(env: FabricEnv): FabricDb {
  if (env.WAVE_AGENT_FABRIC_ENABLED !== "true") throw new FabricError(503, "FABRIC_DISABLED");
  if (!env.DB) throw new FabricError(503, "FABRIC_D1_NOT_BOUND");
  return env.DB;
}
export const utf8 = (text: string) => new TextEncoder().encode(text);
export async function hashHex(text: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", utf8(text));
  return [...new Uint8Array(bytes)].map(v => v.toString(16).padStart(2, "0")).join("");
}
export function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}
function fromBase64Url(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new FabricError(401, "INVALID_ACCESS_JWT");
  const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), ch => ch.charCodeAt(0));
}
function jsonPart<T>(part: string): T {
  try { return JSON.parse(new TextDecoder().decode(fromBase64Url(part))) as T; }
  catch { throw new FabricError(401, "INVALID_ACCESS_JWT"); }
}
function cookie(request: Request): string {
  const match = (request.headers.get("cookie") || "").split(";")
    .map(s => s.trim()).find(s => s.startsWith(cookieName + "="));
  return match ? match.slice(cookieName.length + 1) : "";
}
export function accessConfigured(env: FabricEnv): boolean {
  return Boolean(env.WAVE_ACCESS_ISSUER && env.WAVE_ACCESS_AUD &&
    /^https:\/\/[a-z0-9.-]+\.cloudflareaccess\.com$/.test(env.WAVE_ACCESS_ISSUER));
}
type AccessClaims = { iss?: string; aud?: string[] | string; exp?: number; nbf?: number; iat?: number; sub?: string; email?: string };
export async function verifyAccess(request: Request, env: FabricEnv): Promise<{ issuer: string; subject: string; email: string }> {
  if (!accessConfigured(env)) throw new FabricError(503, "ACCESS_APPLICATION_NOT_CONFIGURED");
  const token = request.headers.get("cf-access-jwt-assertion") || "";
  if (token.length > 8000) throw new FabricError(401, "INVALID_ACCESS_JWT");
  const parts = token.split(".");
  if (parts.length !== 3) throw new FabricError(401, "ACCESS_JWT_REQUIRED");
  const header = jsonPart<{ alg?: string; kid?: string }>(parts[0]);
  const payload = jsonPart<AccessClaims>(parts[1]);
  if (header.alg !== "RS256" || !header.kid || !/^[A-Za-z0-9._-]{1,150}$/.test(header.kid)) {
    throw new FabricError(401, "INVALID_ACCESS_JWT_ALGORITHM");
  }
  const now = Math.floor(Date.now() / 1000);
  const issuer = String(env.WAVE_ACCESS_ISSUER);
  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (payload.iss !== issuer || !aud.includes(env.WAVE_ACCESS_AUD) ||
      !payload.exp || payload.exp <= now || (payload.nbf && payload.nbf > now) ||
      !payload.sub || typeof payload.email !== "string" ||
      (payload.iat && payload.iat > now + 60)) {
    throw new FabricError(401, "ACCESS_JWT_CLAIMS_INVALID");
  }
  const response = await fetch(issuer + "/cdn-cgi/access/certs", {
    signal: AbortSignal.timeout(8000), redirect: "error",
  });
  if (!response.ok) throw new FabricError(503, "ACCESS_JWKS_UNAVAILABLE");
  const keys = await response.json() as { keys?: Array<JsonWebKey & {kid?: string}> };
  const selected = keys.keys?.find(k => k.kid === header.kid && k.kty === "RSA");
  if (!selected) throw new FabricError(401, "ACCESS_KID_UNRECOGNIZED");
  const key = await crypto.subtle.importKey(
    "jwk", selected, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]
  );
  // Crypto APIs require ArrayBuffer-backed data in current TS DOM typings.
  // Copy untrusted base64 bytes into a fresh buffer (never SharedArrayBuffer).
  const signature = new Uint8Array(fromBase64Url(parts[2])).buffer;
  const signedBytes = new TextEncoder().encode(parts[0] + "." + parts[1]).buffer;
  const verified = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5", key, signature, signedBytes
  );
  if (!verified) throw new FabricError(401, "ACCESS_SIGNATURE_INVALID");
  const email = payload.email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new FabricError(401, "ACCESS_EMAIL_INVALID");
  return { issuer, subject: payload.sub, email };
}
async function setSession(db: FabricDb, principalId: string): Promise<{
  headers: Record<string,string>; csrf: string; expiresAt: number;
}> {
  const raw = newToken(), csrf = newToken();
  const expiresAt = Date.now() + sessionLifeMs;
  const principal = await db.prepare(
    "SELECT auth_version FROM af_principals WHERE principal_id=? AND status='ACTIVE'"
  ).bind(principalId).first<{ auth_version: number }>();
  if (!principal) throw new FabricError(403, "PRINCIPAL_NOT_ACTIVE");
  await db.prepare(`INSERT INTO af_sessions
    (token_sha256, principal_id, csrf_sha256, auth_version, created_at, expires_at)
    VALUES (?,?,?,?,?,?)`).bind(
    await hashHex(raw), principalId, await hashHex(csrf),
    principal.auth_version, Date.now(), expiresAt,
  ).run();
  return {
    headers: { "Set-Cookie": cookieName + "=" + raw +
      "; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=900",
      "Cache-Control": "no-store" },
    csrf, expiresAt
  };
}
export async function requireFabricActor(request: Request, env: FabricEnv): Promise<FabricActor> {
  const db = requireFabricDb(env);
  const value = cookie(request);
  if (!value || value.length > 128) throw new FabricError(401, "FABRIC_SESSION_REQUIRED");
  const tokenHash = await hashHex(value);
  const row = await db.prepare(`
    SELECT s.principal_id, s.csrf_sha256, p.kind
    FROM af_sessions s JOIN af_principals p ON p.principal_id=s.principal_id
    WHERE s.token_sha256=? AND s.expires_at>? AND s.revoked_at IS NULL
      AND s.auth_version=p.auth_version AND p.status='ACTIVE'
  `).bind(tokenHash, Date.now()).first<{principal_id:string;csrf_sha256:string;kind:"HUMAN"|"RUNTIME"}>();
  if (!row) throw new FabricError(401, "FABRIC_SESSION_INVALID");
  if (request.method !== "GET" && request.method !== "HEAD") {
    if (request.headers.get("origin") !== new URL(request.url).origin) {
      throw new FabricError(403, "ORIGIN_DENIED");
    }
    const csrf = request.headers.get("x-wave-csrf") || "";
    if (!csrf || csrf.length > 256 || await hashHex(csrf) !== row.csrf_sha256) {
      throw new FabricError(403, "CSRF_DENIED");
    }
  }
  return {principalId:row.principal_id,kind:row.kind,tokenHash};
}
export async function createOwnerFabricSession(request: Request, env: FabricEnv) {
  const db = requireFabricDb(env);
  if (!(await hasOwnerSession(request, env))) throw new FabricError(401, "OWNER_1LSS_REQUIRED");
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    // CI/native clients may use signed Owner bearer rather than an ambient browser cookie.
    if (!(request.headers.get("authorization") || "").startsWith("Bearer ")) {
      throw new FabricError(403, "ORIGIN_DENIED");
    }
  }
  await db.prepare(`INSERT OR IGNORE INTO af_principals
   (principal_id,kind,status,display_name,created_at)
   VALUES ('human:owner','HUMAN','ACTIVE','OGENIC Owner',?)`).bind(Date.now()).run();
  return setSession(db,"human:owner");
}
export async function issueEnrollment(request: Request, env: FabricEnv, actor: FabricActor, input: {
  principal_id?: unknown; permitted_email?: unknown; display_name?: unknown;
}) {
  if (actor.principalId !== "human:owner" || !(await hasOwnerSession(request,env))) {
    throw new FabricError(403, "OWNER_1LSS_REQUIRED");
  }
  const db = requireFabricDb(env);
  const principalId = String(input.principal_id || "");
  if (!/^human:(gs|gt)$/.test(principalId)) throw new FabricError(400, "UNKNOWN_HUMAN_PRINCIPAL");
  const permittedEmail = String(input.permitted_email || "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(permittedEmail) || permittedEmail.length > 250) {
    throw new FabricError(400, "INVALID_ENROLLMENT_EMAIL");
  }
  const name = String(input.display_name || principalId).slice(0,100);
  const token = newToken(), enrollId = crypto.randomUUID(), now = Date.now();
  await db.batch([
    db.prepare(`INSERT OR IGNORE INTO af_principals
      (principal_id,kind,status,display_name,created_at) VALUES (?,'HUMAN','PENDING',?,?)`)
      .bind(principalId,name,now),
    db.prepare(`INSERT INTO af_enrollments
      (enrollment_id,principal_id,permitted_email,token_sha256,expires_at,created_by,created_at)
      SELECT ?,?,?,?,?,?,? WHERE EXISTS
        (SELECT 1 FROM af_principals WHERE principal_id=? AND status='PENDING'
         AND external_subject IS NULL)`)
      .bind(enrollId,principalId,permittedEmail,await hashHex(token),
        now+10*60_000,actor.principalId,now,principalId)
  ]);
  const stored = await db.prepare("SELECT enrollment_id FROM af_enrollments WHERE enrollment_id=?")
    .bind(enrollId).first();
  if (!stored) throw new FabricError(409, "PRINCIPAL_ALREADY_ENROLLED");
  return { enrollment_id:enrollId, enrollment_token:token, expires_at:new Date(now+600_000).toISOString() };
}
export async function exchangeAccessSession(request: Request, env: FabricEnv, token: string) {
  const db = requireFabricDb(env);
  const subject = await verifyAccess(request,env);
  const hash = token ? await hashHex(token) : null;
  const now = Date.now();
  const row = hash ? await db.prepare(`
    SELECT e.principal_id
    FROM af_enrollments e JOIN af_principals p ON p.principal_id=e.principal_id
    WHERE e.token_sha256=? AND e.consumed_at IS NULL AND e.expires_at>?
      AND e.permitted_email=? AND p.status='PENDING'
  `).bind(hash,now,subject.email).first<{principal_id:string}>() : null;
  let principalId = row?.principal_id || "";
  if (row) {
    await db.batch([
      db.prepare(`UPDATE af_principals
        SET external_issuer=?, external_subject=?, status='ACTIVE',auth_version=auth_version+1
        WHERE principal_id=? AND status='PENDING' AND external_subject IS NULL`)
        .bind(subject.issuer,subject.subject,principalId),
      db.prepare(`UPDATE af_enrollments SET consumed_at=?
        WHERE token_sha256=? AND consumed_at IS NULL AND expires_at>?`)
        .bind(now,hash,now),
    ]);
  } else if (!hash) {
    const existing = await db.prepare(`SELECT principal_id FROM af_principals WHERE
      external_issuer=? AND external_subject=? AND status='ACTIVE'`)
      .bind(subject.issuer,subject.subject).first<{principal_id:string}>();
    if (!existing) throw new FabricError(401, "GT_NOT_ENROLLED");
    principalId = existing.principal_id;
  } else throw new FabricError(401, "ENROLLMENT_INVALID_OR_EXPIRED");
  const binding = await db.prepare(`SELECT principal_id FROM af_principals
    WHERE principal_id=? AND external_issuer=? AND external_subject=? AND status='ACTIVE'`)
    .bind(principalId,subject.issuer,subject.subject).first();
  if (!binding) throw new FabricError(409, "EXTERNAL_SUBJECT_BINDING_CONFLICT");
  return { principal_id:principalId, ...await setSession(db,principalId) };
}
