import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { CERTIFICATE_SCHEMA, canonicalCertificatePayload, verifyCapabilityCertificate } from "../packages/maop-core/src/authority-certificate.mjs";

if (!globalThis.crypto) globalThis.crypto = webcrypto;
const now = 1800000000;
const keys = await webcrypto.subtle.generateKey("Ed25519", true, ["sign", "verify"]);
const trustedKeys = { "owner-pinned-key": keys.publicKey };
const claims = {
  schema: CERTIFICATE_SCHEMA, certificate_id: "cert-test-1", issuer: "owner",
  subject: "openai-gt", audience: "ogenic-wave-command", environment: "staging",
  issued_at: now - 60, expires_at: now + 300,
  permissions: ["READ", "BUILD", "DEBUG", "RUNNER", "AUDIT", "DONE", "COMMIT", "DEPLOY"],
  resources: ["Ogenicchocolate21debug/Build-Platform"], source_sha: "a".repeat(40),
  evidence_ref: "ruby:staging-test:verified"
};
const sign = async (body, key = keys.privateKey) => ({
  claims: body,
  proof: {
    algorithm: "Ed25519", key_id: "owner-pinned-key",
    signature: Buffer.from(await webcrypto.subtle.sign("Ed25519", key, new TextEncoder().encode(canonicalCertificatePayload(body)))).toString("base64url")
  }
});
const ctx = {
  trustedKeys, now, subject: "openai-gt", audience: "ogenic-wave-command",
  environment: "staging", resource: "Ogenicchocolate21debug/Build-Platform",
  action: "BUILD", revokedIds: new Set(), ownerVerified: false
};
test("valid signed certificate authorizes requested BUILD, never bypasses Yellow", async () => {
  const result = await verifyCapabilityCertificate(await sign(claims), ctx);
  assert.equal(result.authorized, true);
  assert.equal(result.execution_authority, "YELLOW_STONE_ONLY");
  assert.equal(result.source_sha, "a".repeat(40));
  assert.equal(JSON.stringify(result).includes("signature"), false);
});
test("issuer key must be pinned server-side", async () => {
  const r = await verifyCapabilityCertificate(await sign(claims), { ...ctx, trustedKeys: {} });
  assert.equal(r.code, "UNTRUSTED_CERTIFICATE_ISSUER");
});
test("edited certificate fails signature verification", async () => {
  const c = await sign(claims);
  c.claims.permissions = [...claims.permissions, "DELETE"];
  assert.equal((await verifyCapabilityCertificate(c, { ...ctx, action: "DELETE", ownerVerified: true })).code, "CERTIFICATE_SIGNATURE_INVALID");
});
test("cross-account and cross-environment reuse denied", async () => {
  const c = await sign(claims);
  assert.equal((await verifyCapabilityCertificate(c, { ...ctx, subject: "openai-gs" })).code, "CERTIFICATE_CONTEXT_MISMATCH");
  assert.equal((await verifyCapabilityCertificate(c, { ...ctx, environment: "production" })).code, "CERTIFICATE_CONTEXT_MISMATCH");
});
test("certificate expiry and future issue fail closed", async () => {
  const c = await sign(claims);
  assert.equal((await verifyCapabilityCertificate(c, { ...ctx, now: now + 301 })).code, "CERTIFICATE_EXPIRED_OR_UNBOUNDED");
  const f = await sign({ ...claims, issued_at: now + 20, expires_at: now + 200 });
  assert.equal((await verifyCapabilityCertificate(f, ctx)).code, "CERTIFICATE_EXPIRED_OR_UNBOUNDED");
});
test("revoked certificate rejected", async () => {
  const c = await sign(claims);
  assert.equal((await verifyCapabilityCertificate(c, { ...ctx, revokedIds: new Set(["cert-test-1"]) })).code, "CERTIFICATE_REVOKED");
});
test("source grant does not mean deploy authority without separately verified owner", async () => {
  const c = await sign(claims);
  assert.equal((await verifyCapabilityCertificate(c, { ...ctx, action: "DEPLOY" })).code, "OWNER_APPROVAL_REQUIRED");
  assert.equal((await verifyCapabilityCertificate(c, { ...ctx, action: "DEPLOY", ownerVerified: true })).authorized, true);
});
test("unsupported resource/action fail, no default wildcard grants", async () => {
  const c = await sign(claims);
  assert.equal((await verifyCapabilityCertificate(c, { ...ctx, action: "DELETE" })).code, "ACTION_NOT_GRANTED");
  assert.equal((await verifyCapabilityCertificate(c, { ...ctx, resource: "other-repo" })).code, "RESOURCE_NOT_GRANTED");
});
test("raw secret values are not valid certificate claims", async () => {
  const bad = await sign({ ...claims, secretValue: "not-real-test-value" });
  assert.equal((await verifyCapabilityCertificate(bad, ctx)).code, "SECRET_VALUE_IN_CERTIFICATE");
});
test("canonical JSON is stable under property reordering", () => {
  assert.equal(canonicalCertificatePayload({ b: 2, a: { z: 4, x: 1 } }), canonicalCertificatePayload({ a: { x: 1, z: 4 }, b: 2 }));
});
