import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, statSync } from "node:fs";
import { normalizeKey, publicKeyBody, selectTrustedHost, inspectHostAccess } from "../scripts/unifiend-host-access.mjs";

const server = "ssh-ed25519 " + "A".repeat(60);
const client = "ssh-ed25519 " + "B".repeat(60);
const scanLine = `165.232.174.32 ${server}`;
const pin = "SHA256:" + "C".repeat(43);

test("key normalization decodes recognized storage formats without changing private key bodies", () => {
  const key = "-----BEGIN OPENSSH PRIVATE KEY-----\n" + "A".repeat(90) + "\n-----END OPENSSH PRIVATE KEY-----";
  for (const stored of [key, JSON.stringify(key), key.replaceAll("\n", "\\n"), Buffer.from(key).toString("base64")]) {
    assert.equal(normalizeKey(stored).value, key);
  }
  assert.equal(normalizeKey("ordinary-reference").value, "ordinary-reference");
});

test("public-key parser accepts actual whitespace and trailing newline in archived repair formats", () => {
  assert.equal(publicKeyBody(scanLine + "\n"), server);
  assert.equal(publicKeyBody("label\t" + server + " user@host\n"), server);
  assert.equal(publicKeyBody("ssh-ed25519 invalid!"), null);
});

test("trusted host selection requires the stored server key or fingerprint", () => {
  assert.equal(selectTrustedHost({ saved: server, serverKeys: [scanLine], fingerprint: () => "" }), scanLine);
  assert.equal(selectTrustedHost({ saved: pin, serverKeys: [scanLine], fingerprint: () => pin }), scanLine);
  assert.equal(selectTrustedHost({ saved: client, serverKeys: [scanLine], fingerprint: () => "" }), null);
  assert.equal(selectTrustedHost({ saved: "", serverKeys: [scanLine], fingerprint: () => "" }), null);
});

function runFixture() {
  const calls = [];
  const run = (command, args, options) => {
    calls.push({ command, args });
    assert.equal(options.stdio[0], "ignore");
    if (command === "ssh-keyscan") return { status: 0, stdout: scanLine + "\n", stderr: "" };
    if (command === "ssh-keygen" && args[0] === "-y") {
      assert.equal(statSync(args[args.length - 1]).mode & 0o777, 0o600);
      return { status: 0, stdout: client + "\n", stderr: "" };
    }
    if (command === "ssh") {
      assert.ok(args.includes("StrictHostKeyChecking=yes"));
      assert.ok(args.includes("IdentitiesOnly=yes"));
      assert.ok(args.includes("BatchMode=yes"));
      assert.ok(args.includes("wave@165.232.174.32"));
      assert.equal(args.some(x => x.includes("StrictHostKeyChecking=no")), false);
      return { status: 0, stdout: "UNIFIEND_HOST_ACCESS_V1\nLinux\nnode=present\ncodex=missing\n", stderr: "" };
    }
    return { status: 1, stdout: "", stderr: "sensitive-error-fixture" };
  };
  return { run, calls };
}

test("a client public key cannot be used as server trust or trigger SSH authentication", () => {
  const fixture = runFixture();
  const report = inspectHostAccess({ saved: client, publicValue: client, privateValue: "fixture PRIVATE KEY", run: fixture.run });
  assert.equal(report.reason, "TRUSTED_SERVER_PIN_MISSING");
  assert.equal(report.stored_public_key_matches_client, true);
  assert.equal(report.ssh_auth_attempted, false);
  assert.equal(fixture.calls.some(c => c.command === "ssh"), false);
  const privateFile = fixture.calls.find(c => c.command === "ssh-keygen" && c.args[0] === "-y").args.at(-1);
  assert.equal(existsSync(privateFile), false);
});

test("pinned SSH performs only fixed host inspection and returns allowlisted results", () => {
  const fixture = runFixture();
  const report = inspectHostAccess({ saved: server, publicValue: client, privateValue: "fixture PRIVATE KEY", run: fixture.run });
  assert.equal(report.state, "VERIFIED_EXECUTION");
  assert.deepEqual(report.tools, { node: "present", codex: "missing" });
  for (const value of [server, client, "fixture PRIVATE KEY", "sensitive-error-fixture"]) assert.equal(JSON.stringify(report).includes(value), false);
  const privateFile = fixture.calls.find(c => c.command === "ssh").args[fixture.calls.find(c => c.command === "ssh").args.indexOf("-i") + 1];
  assert.equal(existsSync(privateFile), false);
});
