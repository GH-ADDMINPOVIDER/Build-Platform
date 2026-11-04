import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, statSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { normalizeKey, publicKeyBody, selectTrustedHost, inspectHostAccess, validateConsoleTrust } from "../scripts/unifiend-host-access.mjs";

const server = "ssh-ed25519 " + "A".repeat(60);
const client = "ssh-ed25519 " + "B".repeat(60);
const scanLine = `165.232.174.32 ${server}`;
const pin = "SHA256:" + "C".repeat(43);
const consoleTrust = JSON.parse(readFileSync(new URL("../config/unifiend-host-trust.json", import.meta.url), "utf8"));

test("console trust requires the exact machine and independently matching public-key fingerprint", () => {
  assert.equal(validateConsoleTrust(consoleTrust), true);
  for (const patch of [{ droplet_id: 1 }, { address: "127.0.0.1" }, { port: 2222 },
    { fingerprint_sha256: "SHA256:" + "A".repeat(43) }, { known_hosts: consoleTrust.known_hosts + "\n" }]) {
    assert.equal(validateConsoleTrust({ ...consoleTrust, ...patch }), false);
  }
});

test("invalid console trust cannot start a network probe", () => {
  let called = false;
  const report = inspectHostAccess({ consoleTrust: { ...consoleTrust, address: "127.0.0.1" }, run: () => { called = true; } });
  assert.equal(report.reason, "CONSOLE_TRUST_CONFIGURATION_INVALID");
  assert.equal(called, false);
});

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

test("Owner console pin verifies the host despite the stale reference, without bypassing encrypted client keys", () => {
  const fixture = runFixture();
  const run = (command, args, options) => command === "ssh-keyscan"
    ? { status: 0, stdout: consoleTrust.known_hosts + "\n", stderr: "" }
    : command === "ssh-keygen" && args[0] === "-y"
      ? { status: 255, stdout: "", stderr: "incorrect passphrase supplied to decrypt private key" }
      : fixture.run(command, args, options);
  const report = inspectHostAccess({ saved: client, publicValue: client, privateValue: "fixture PRIVATE KEY", consoleTrust, run });
  assert.equal(report.server_identity_verified, true);
  assert.equal(report.verified_console_pin_matches_server, true);
  assert.equal(report.stored_pin_matches_server, false);
  assert.equal(report.client_key_failure, "PASSPHRASE_REQUIRED");
  assert.equal(report.reason, "CLIENT_KEY_NOT_USABLE_WITHOUT_PROMPT");
  assert.equal(report.ssh_auth_attempted, false);
});

test("a changed server key cannot fall back to a stale secret-manager pin", () => {
  const fixture = runFixture();
  const report = inspectHostAccess({ saved: server, publicValue: client, privateValue: "fixture PRIVATE KEY", consoleTrust, run: fixture.run });
  assert.equal(report.stored_pin_matches_server, true);
  assert.equal(report.server_identity_verified, false);
  assert.equal(report.ssh_auth_attempted, false);
});

test("remote inspection command executes in a real shell with readable tool status", () => {
  const fixture = runFixture();
  inspectHostAccess({ saved: server, publicValue: client, privateValue: "fixture PRIVATE KEY", run: fixture.run });
  const command = fixture.calls.find(c => c.command === "ssh").args.at(-1);
  const execution = spawnSync("/bin/sh", ["-c", command], { encoding: "utf8" });
  assert.equal(execution.status, 0);
  assert.match(execution.stdout, /^UNIFIEND_HOST_ACCESS_V1\n/);
  assert.match(execution.stdout, /\nnode=present\n/);
  assert.match(execution.stdout, /\nnpm=present\n/);
});
