import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";

// Existing host address recovered from the versioned fingerprint repair.
const HOST = "165.232.174.32";
const USER = "wave";
const REMOTE_INSPECTION = "printf 'UNIFIEND_HOST_ACCESS_V1\\n'; uname -s; for x in node npm docker codex infisical; do if command -v \"$x\" >/dev/null 2>&1; then printf '%s=present\\n' \"$x\"; else printf '%s=missing\\n' \"$x\"; fi; done";

export function normalizeKey(value) {
  let text = typeof value === "string" ? value.trim() : "";
  let encoding = "PLAIN";
  if (text.startsWith('"')) {
    try { const parsed = JSON.parse(text); if (typeof parsed === "string") { text = parsed.trim(); encoding = "JSON_STRING"; } } catch {}
  }
  if (!text.includes("\n") && text.includes("\\n")) { text = text.replace(/\\r\\n|\\n/g, "\n"); encoding = "ESCAPED_NEWLINES"; }
  if (/^[A-Za-z0-9+/=]+$/.test(text) && text.length > 80) {
    const decoded = Buffer.from(text, "base64").toString("utf8").trim();
    if (/^(?:-----BEGIN (?:OPENSSH|RSA|EC|ENCRYPTED) PRIVATE KEY-----|ssh-|ecdsa-sha2-)/.test(decoded)) {
      text = decoded; encoding = "BASE64";
    }
  }
  return { value: text.replace(/\r\n/g, "\n"), encoding };
}

export function publicKeyBody(value) {
  const match = String(value).match(/(?:^|\s)(ssh-ed25519|ssh-rsa|ecdsa-sha2-nistp(?:256|384|521))\s+([A-Za-z0-9+/=]{40,})(?:\s|$)/);
  return match ? `${match[1]} ${match[2]}` : null;
}

export function selectTrustedHost({ saved, serverKeys, fingerprint }) {
  const body = publicKeyBody(saved);
  const pin = String(saved).match(/SHA256:[A-Za-z0-9+/=]{35,}|(?:MD5:)?(?:[a-f0-9]{2}:){15}[a-f0-9]{2}/i)?.[0];
  return serverKeys.find(key => {
    if (body && publicKeyBody(key) === body) return true;
    if (!pin) return false;
    if (pin.startsWith("SHA256:")) return fingerprint(key, "sha256") === pin;
    return fingerprint(key, "md5").replace(/^MD5:/i, "").toLowerCase() === pin.replace(/^MD5:/i, "").toLowerCase();
  }) || null;
}

export function validateConsoleTrust(trust) {
  if (trust?.schema !== "UNIFIEND_HOST_TRUST_V1" || trust.droplet_id !== 604432491 || trust.address !== HOST
    || trust.port !== 22 || trust.verified_via !== "OWNER_DIGITALOCEAN_CONSOLE"
    || typeof trust.known_hosts !== "string" || /[\r\n]/.test(trust.known_hosts)
    || !trust.known_hosts.startsWith(HOST + " ssh-ed25519 ")) return false;
  const body = publicKeyBody(trust.known_hosts);
  if (!body) return false;
  const binary = Buffer.from(body.split(" ")[1], "base64");
  // The SSH wire encoding contains a four-byte algorithm length, the
  // eleven-byte algorithm, then a four-byte key length and 32-byte key.
  if (binary.length !== 51 || binary.readUInt32BE(0) !== 11 || binary.subarray(4, 15).toString() !== "ssh-ed25519"
    || binary.readUInt32BE(15) !== 32) return false;
  return "SHA256:" + createHash("sha256").update(binary).digest("base64").replace(/=+$/, "") === trust.fingerprint_sha256;
}

export function inspectHostAccess({ saved, publicValue, privateValue, consoleTrust = null, run = spawnSync }) {
  const report = { host: "Ocian-S-Host", operation: "READ_ONLY", state: "BLOCKED", ssh_auth_attempted: false };
  if (consoleTrust && !validateConsoleTrust(consoleTrust)) { report.reason = "CONSOLE_TRUST_CONFIGURATION_INVALID"; return report; }
  report.trust_source = consoleTrust ? "OWNER_DIGITALOCEAN_CONSOLE" : "EXISTING_INFISICAL_REFERENCE";
  const normalizedPrivate = normalizeKey(privateValue);
  privateValue = normalizedPrivate.value;
  saved = normalizeKey(saved).value;
  publicValue = normalizeKey(publicValue).value;
  report.private_key_encoding = normalizedPrivate.encoding;
  report.private_key_has_header = /^-----BEGIN (?:OPENSSH|RSA|EC|ENCRYPTED) PRIVATE KEY-----/.test(privateValue);
  report.private_key_has_footer = /-----END (?:OPENSSH|RSA|EC|ENCRYPTED) PRIVATE KEY-----$/.test(privateValue);
  report.private_key_multiline = privateValue.includes("\n");
  report.stored_pin_format = publicKeyBody(saved) ? "PUBLIC_KEY" : /SHA256:|(?:[a-f0-9]{2}:){15}[a-f0-9]{2}/i.test(saved) ? "FINGERPRINT" : "OTHER";
  const directory = mkdtempSync(join(tmpdir(), "unifiend-host-"));
  const execute = (command, args, timeout = 15000) => run(command, args, {
    encoding: "utf8", timeout, maxBuffer: 256 * 1024, stdio: ["ignore", "pipe", "pipe"],
  });
  const file = (name, value) => {
    const path = join(directory, name);
    writeFileSync(path, value, { mode: 0o600 });
    return path;
  };
  const fingerprint = (key, type) => {
    const result = execute("ssh-keygen", ["-lf", file("fingerprint.pub", key + "\n"), "-E", type]);
    return result.status === 0 ? result.stdout.match(/SHA256:[A-Za-z0-9+/=]+|MD5:(?:[a-f0-9]{2}:){15}[a-f0-9]{2}/i)?.[0] || "" : "";
  };
  try {
    const scan = execute("ssh-keyscan", ["-T", "7", "-p", "22", HOST], 25000);
    const serverKeys = String(scan.stdout || "").split(/\r?\n/).filter(line => line.startsWith(HOST + " ") && publicKeyBody(line));
    report.host_key_observed = serverKeys.length > 0;
    report.host_algorithms = [...new Set(serverKeys.map(line => publicKeyBody(line).split(" ")[0]))];
    if (!serverKeys.length) { report.reason = "HOST_KEY_UNREACHABLE"; return report; }
    const storedTrusted = selectTrustedHost({ saved, serverKeys, fingerprint });
    report.stored_pin_matches_server = !!storedTrusted;
    const trusted = consoleTrust ? selectTrustedHost({ saved: consoleTrust.known_hosts, serverKeys, fingerprint }) : storedTrusted;
    if (consoleTrust) report.verified_console_pin_matches_server = !!trusted;
    report.server_identity_verified = !!trusted;
    report.stored_public_key_matches_server = !!publicKeyBody(publicValue) && serverKeys.some(key => publicKeyBody(key) === publicKeyBody(publicValue));
    if (!privateValue?.includes("PRIVATE KEY")) { report.reason = "CLIENT_PRIVATE_KEY_MISSING"; return report; }
    const privatePath = file("identity", privateValue.trimEnd() + "\n");
    const derived = execute("ssh-keygen", ["-y", "-P", "", "-f", privatePath]);
    const clientKey = derived.status === 0 ? publicKeyBody(derived.stdout) : null;
    report.client_key_usable = !!clientKey;
    if (!clientKey) {
      const error = String(derived.stderr || "").toLowerCase();
      report.client_key_failure = /passphrase|encrypted/.test(error) ? "PASSPHRASE_REQUIRED"
        : /libcrypto|invalid format/.test(error) ? "KEY_FORMAT_REJECTED" : "KEY_DERIVATION_FAILED";
    }
    report.stored_public_key_matches_client = !!clientKey && clientKey === publicKeyBody(publicValue);
    report.stored_pin_matches_client = !!clientKey && !!selectTrustedHost({ saved, serverKeys: [clientKey], fingerprint });
    if (!trusted) { report.reason = "TRUSTED_SERVER_PIN_MISSING"; return report; }
    if (!clientKey) { report.reason = "CLIENT_KEY_NOT_USABLE_WITHOUT_PROMPT"; return report; }
    const knownHosts = file("known_hosts", trusted + "\n");
    report.ssh_auth_attempted = true;
    const connection = execute("ssh", ["-F", "/dev/null", "-T", "-p", "22", "-i", privatePath,
      "-o", "BatchMode=yes", "-o", "IdentitiesOnly=yes", "-o", "StrictHostKeyChecking=yes",
      "-o", `UserKnownHostsFile=${knownHosts}`, "-o", "GlobalKnownHostsFile=/dev/null",
      "-o", "PasswordAuthentication=no", "-o", "ConnectTimeout=10", "-o", "ConnectionAttempts=1",
      `${USER}@${HOST}`, REMOTE_INSPECTION], 30000);
    if (connection.status !== 0) { report.reason = "PINNED_SSH_FAILED"; return report; }
    const lines = String(connection.stdout).trim().split(/\r?\n/);
    if (lines[0] !== "UNIFIEND_HOST_ACCESS_V1") { report.reason = "REMOTE_RECEIPT_INVALID"; return report; }
    report.state = "VERIFIED_EXECUTION";
    report.os = ["Linux", "Darwin", "FreeBSD"].includes(lines[1]) ? lines[1] : "OTHER";
    report.tools = Object.fromEntries(lines.slice(2).filter(x => /^(node|npm|docker|codex|infisical)=(present|missing)$/.test(x)).map(x => x.split("=")));
  } catch { report.reason = "HOST_INSPECTION_FAILED"; }
  finally { rmSync(directory, { recursive: true, force: true }); }
  return report;
}
