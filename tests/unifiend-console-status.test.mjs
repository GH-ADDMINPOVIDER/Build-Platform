import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

function verifyTransport(command, args) {
  const source = readFileSync("scripts/unifiend-console-status.sh", "utf8");
  const body = source.split("<<'UNIFIEND_STATUS'\n")[1].split("\nUNIFIEND_STATUS")[0];
  const directory = mkdtempSync(join(tmpdir(), "unifiend-console-test-"));
  try {
    const bin = join(directory, ".local", "bin");
    mkdirSync(bin, { recursive: true });
    writeFileSync(join(bin, "codex"), "#!/bin/sh\nprintf 'Logged in using ChatGPT\\nfixture-sensitive-marker\\n'\n", { mode: 0o700 });
    writeFileSync(join(bin, "infisical"), "#!/bin/sh\nprintf 'fixture-sensitive-marker\\n'\n", { mode: 0o700 });
    const input = `export HOME=${JSON.stringify(directory)}\n` + body;
    const execution = spawnSync(command, args, {
      input, encoding: "utf8", timeout: 20000,
    });
    assert.equal(execution.status, 0, execution.stderr);
    assert.match(execution.stdout, /codex=LOGIN_OK\nAUTH_MODE=CHATGPT\n/);
    assert.match(execution.stdout, /infisical=LOGIN_OK\n/);
    assert.equal(execution.stdout.includes("fixture-sensitive-marker"), false);
    assert.equal(execution.stderr.includes("syntax error"), false);
  } finally { rmSync(directory, { recursive: true, force: true }); }
}

test("Console auth probe preserves multiline stdin and prints only allowed status", () => {
  verifyTransport("/bin/bash", ["-s"]);
});

let restrictedUidMap = false;
try { restrictedUidMap = /^\s*0\s+0\s+1\s*$/.test(readFileSync("/proc/self/uid_map", "utf8")); } catch {}
test("Console auth probe works through the real sudo transport on Ubuntu", {
  skip: restrictedUidMap ? "This sandbox maps only UID 0; execute the sudo regression on the Ubuntu cloud check" : false,
}, () => {
  verifyTransport("sudo", ["-H", "-u", process.env.USER || "root", "/bin/bash", "-s"]);
});
