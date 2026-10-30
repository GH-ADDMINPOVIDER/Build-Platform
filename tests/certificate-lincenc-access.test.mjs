import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const source = p => fs.readFileSync(new URL("../"+p, import.meta.url),"utf8");
const certificate = source("worker/certificate-lincenc-registry.ts");
const tools = source("worker/verified-function-tools.ts");
const entry = source("worker/entry-yellow-stone.ts");
const athena = source("worker/athena-chat-api.ts");
test("read only from the one original OGE-128 staging D1 Certificate, never a TLS certificate",()=>{
  assert.match(certificate,/oge-128-wave-runner-01-baseline-20261018/);
  assert.match(certificate,/FROM certificate_lincenc WHERE certificate_id = \? LIMIT 1/);
  assert.match(certificate,/D1_DOCUMENT_SHA256_MATCH/);
  assert.match(certificate,/CERTIFICATE_INTEGRITY_MISMATCH/);
  assert.match(certificate,/owner_identity_correction_20261020/);
  assert.match(certificate,/github_first/);
  assert.match(certificate,/github_addminprovider/);
  assert.match(certificate,/codex_ts/);
  assert.match(certificate,/runtime_e2e_verified:false/);
  assert.match(certificate,/identity_migration_20261026/);
  assert.match(certificate,/PENDING_EXTERNAL_VERIFICATION/);
  assert.match(certificate,/label:GITHUB_PROVIDER_LABEL/);
  assert.match(certificate,/d1_write_performed:false/);
  assert.doesNotMatch(certificate,/CREATE TABLE|INSERT INTO|UPDATE certificate_lincenc/);
});
test("ATHENA can read live D1 certificate through its dedicated eighth private tool",()=>{
  assert.match(tools,/name: "certificate_lincenc_status"/);
  assert.match(tools,/readCertificateLincenc\(env.DB\)/);
  assert.match(athena,/Exactly eight private function tools/);
  assert.match(athena,/NOT Vercel SSL\/TLS Certs API/);
});
test("owner authenticated read-only endpoint is routed inside existing Worker",()=>{
  assert.match(entry,/pathname === "\/api\/system\/certificate-lincenc"/);
  assert.match(entry,/await hasOwnerSession\(request, env\)/);
  assert.match(entry,/readCertificateLincenc\(env.DB\)/);
  assert.match(entry,/"Cache-Control":"private, no-store"/);
  assert.match(source("src/UnifiendNext.tsx"), /\/api\/system\/certificate-lincenc/);
  assert.match(source(".github/workflows/provider-incentive-staging-deploy.yml"), /CERTIFICATE_LINCENC_STAGING_OWNER_ENDPOINT_READBACK=PASS/);
});
