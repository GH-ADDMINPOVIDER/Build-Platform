// OGENIC/WAVE Certificate Verification v1 — reusable MA-OP/Yellow primitive.
// A certificate proves a bounded grant only when an issuer key is independently trusted.
// This module does not execute tools, mint secrets, or replace Yellow policy.
export const CERTIFICATE_SCHEMA = "ogenic.capability-certificate.v1";
export const GOVERNED_ACTIONS = Object.freeze([
  "BUILD", "DEBUG", "RUNNER", "AUDIT", "DONE", "COMMIT", "DEPLOY",
  "READ", "WRITE", "EXECUTE", "DELETE", "SECRET_USE", "PERMISSION_CHANGE", "BILLING"
]);
const actions = new Set(GOVERNED_ACTIONS);
const protectedActions = new Set(["WRITE", "EXECUTE", "COMMIT", "DEPLOY", "DELETE", "SECRET_USE", "PERMISSION_CHANGE", "BILLING"]);
const shaPattern = /^[0-9a-f]{40}$/i;

export function canonicalCertificatePayload(value) {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonicalCertificatePayload).join(",") + "]";
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    return "{" + Object.keys(value).sort().map((k) => JSON.stringify(k) + ":" + canonicalCertificatePayload(value[k])).join(",") + "}";
  }
  throw new TypeError("CERTIFICATE_UNSUPPORTED_VALUE");
}

function fromBase64Url(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value)) throw new TypeError("INVALID_SIGNATURE_FORMAT");
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const decoded = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
  return Uint8Array.from(decoded, (char) => char.charCodeAt(0));
}

const failed = (code) => ({ authorized: false, code, execution_authority: "YELLOW_STONE_ONLY" });

/**
 * trustedKeys MUST be populated from trusted server bindings, never the request.
 * ownerVerified MUST come from independent authenticated owner approval, never claims.
 * No raw credentials, authorization cookies, or provider tokens belong in claims.
 */
export async function verifyCapabilityCertificate(certificate, context = {}) {
  try {
    const claims = certificate?.claims;
    const proof = certificate?.proof;
    if (!claims || !proof || claims.schema !== CERTIFICATE_SCHEMA) return failed("CERTIFICATE_SCHEMA_INVALID");
    if (Object.keys(claims).some((key) => /secretvalue|credentialvalue|privatekey|access_token|password/i.test(key))) {
      return failed("SECRET_VALUE_IN_CERTIFICATE");
    }
    const keyId = proof.key_id;
    const publicKey = typeof keyId === "string" ? context.trustedKeys?.[keyId] : undefined;
    if (!publicKey) return failed("UNTRUSTED_CERTIFICATE_ISSUER");
    if (proof.algorithm !== "Ed25519") return failed("UNSUPPORTED_SIGNATURE_ALGORITHM");
    if (typeof claims.certificate_id !== "string" || !claims.certificate_id ||
        typeof claims.subject !== "string" || !claims.subject ||
        typeof claims.issuer !== "string" || !claims.issuer ||
        typeof claims.evidence_ref !== "string" || !claims.evidence_ref ||
        !shaPattern.test(claims.source_sha)) return failed("CERTIFICATE_FIELDS_INVALID");
    const validSignature = await crypto.subtle.verify(
      "Ed25519", publicKey, fromBase64Url(proof.signature),
      new TextEncoder().encode(canonicalCertificatePayload(claims))
    );
    if (!validSignature) return failed("CERTIFICATE_SIGNATURE_INVALID");
    const now = context.now ?? Math.floor(Date.now() / 1000);
    if (!Number.isSafeInteger(claims.issued_at) || !Number.isSafeInteger(claims.expires_at) ||
        claims.issued_at > now || claims.expires_at <= now ||
        claims.expires_at - claims.issued_at > 900) return failed("CERTIFICATE_EXPIRED_OR_UNBOUNDED");
    if (context.revokedIds?.has(claims.certificate_id)) return failed("CERTIFICATE_REVOKED");
    if (claims.subject !== context.subject || claims.audience !== context.audience ||
        claims.environment !== context.environment) return failed("CERTIFICATE_CONTEXT_MISMATCH");
    const action = context.action;
    if (!actions.has(action) || !Array.isArray(claims.permissions) ||
        !claims.permissions.includes(action)) return failed("ACTION_NOT_GRANTED");
    if (!Array.isArray(claims.resources) || !claims.resources.length ||
        !claims.resources.includes(context.resource)) return failed("RESOURCE_NOT_GRANTED");
    // Owner approval is an independent server-side check, never an AI-supplied flag.
    if (protectedActions.has(action) && context.ownerVerified !== true) return failed("OWNER_APPROVAL_REQUIRED");
    return {
      authorized: true, code: "CERTIFICATE_VERIFIED", subject: claims.subject,
      action, resource: context.resource, environment: claims.environment,
      certificate_id: claims.certificate_id, source_sha: claims.source_sha,
      evidence_ref: claims.evidence_ref, expires_at: claims.expires_at,
      execution_authority: "YELLOW_STONE_ONLY",
      note: "Final tool execution still requires Yellow authority and actual provider capability."
    };
  } catch {
    return failed("CERTIFICATE_VERIFY_ERROR");
  }
}
