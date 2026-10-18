// OGENIC owner terminal authorization audit.
// Strictly local status and identity-claim comparison: no auth values leave the process.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

const home = homedir();
const digest = (text) => createHash("sha256").update(text.trim().toLowerCase()).digest("hex");
const accountHashes = {
  GPT_TS_CODEX: digest("tawatchaisamornrum11@gmail.com"),
  GPT_GS_CODEX: digest("suthi_2538@hotmail.com"),
};
const candidatePaths = [
  process.env.CODEX_HOME,
  join(home, ".codex"),
  join(home, ".codex-ts"),
  join(home, ".codex-gs"),
  join(home, ".config", "codex-ts"),
  join(home, ".config", "codex-gs"),
  "/opt/wave/.codex-ts",
  "/opt/wave/.codex-gs",
].filter(Boolean);
const seen = new Set();
const codexHomes = [];
const cli = spawnSync("codex", ["--version"], { encoding: "utf8", timeout: 8000 });
const cliAvailable = cli.status === 0;
const runStatus = (directory) => {
  if (!cliAvailable) return "CLI_UNAVAILABLE";
  const result = spawnSync("codex", ["login", "status"], {
    encoding: "utf8", timeout: 12000, maxBuffer: 1024,
    env: { ...process.env, CODEX_HOME: directory, OPENAI_API_KEY: "", CODEX_API_KEY: "", GH_TOKEN: "", GITHUB_TOKEN: "" },
  });
  return result.status === 0 ? "SIGNED_IN" : "LOGIN_NOT_VERIFIED";
};
for (const candidate of candidatePaths) {
  const dir = resolve(candidate);
  if (seen.has(dir)) continue;
  seen.add(dir);
  const authPath = join(dir, "auth.json");
  if (!existsSync(dir)) {
    codexHomes.push({ path_tag: dir.replace(home, "~"), exists: false, login: "NO_DIRECTORY", identity: "NOT_VERIFIED" });
    continue;
  }
  let identity = "NOT_VERIFIED";
  let tokenExpiry = "UNVERIFIED";
  if (existsSync(authPath)) {
    try {
      const auth = JSON.parse(readFileSync(authPath, "utf8"));
      const jwt = auth.tokens?.id_token;
      if (typeof jwt === "string" && jwt.split(".").length === 3) {
        const decoded = JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString("utf8"));
        const mail = typeof decoded.email === "string" ? decoded.email : "";
        const hashed = mail ? digest(mail) : "";
        identity = hashed === accountHashes.GPT_TS_CODEX ? "GPT_TS_CODEX"
          : hashed === accountHashes.GPT_GS_CODEX ? "GPT_GS_CODEX"
          : "UNKNOWN_OR_UNAVAILABLE_CLAIM";
        tokenExpiry = Number.isFinite(decoded.exp) ? (decoded.exp > Date.now()/1000 ? "FUTURE" : "PAST") : "NOT_PROVIDED";
      }
    } catch { identity = "UNREADABLE_LOCAL_METADATA"; }
  }
  codexHomes.push({
    path_tag: dir.replace(home, "~"), exists: true, auth_metadata_present: existsSync(authPath),
    login: runStatus(dir), identity, token_expiry: tokenExpiry,
  });
}
const logged = codexHomes.filter((x) => x.login === "SIGNED_IN");
const verifiedIdentities = [...new Set(logged.map((x) => x.identity).filter((x) => x==="GPT_TS_CODEX" || x==="GPT_GS_CODEX"))];
const serviceResult = spawnSync("systemctl", ["list-units", "--all", "--type=service", "--no-pager", "--plain"], {
  encoding: "utf8", timeout: 8000, maxBuffer: 128*1024
});
const services = (serviceResult.stdout ?? "").split("\n")
  .filter((line) => /actions\.runner|github\.runner/.test(line)).map((line) => line.trim().split(/\s+/)[0]);
const report = {
  schema: "ogenic.owner.terminal-identity-evidence.v1",
  source_sha: process.env.GITHUB_SHA ?? "unknown",
  github_run_id: process.env.GITHUB_RUN_ID ?? "unknown",
  runner_name: process.env.RUNNER_NAME ?? "unknown",
  host_actions_services: services,
  runtime: { codex_cli_available: cliAvailable, profiles_checked: codexHomes.length, profiles: codexHomes },
  verified_distinct_codex_identities: verifiedIdentities,
  dual_codex_authorized: verifiedIdentities.includes("GPT_TS_CODEX") && verifiedIdentities.includes("GPT_GS_CODEX"),
  github_secondary_repo_write: "REQUIRES_INDEPENDENT_REPO_PERMISSION_PROOF",
  terminal_transport: "GITHUB_ACTIONS_SELFHOSTED",
  identity_tokens_exposed: false, secret_values_logged: false,
  interpretation: "LOCAL_IDENTITY_AND_STATUS_ONLY_NOT_PAID_INFERENCE_OR_CROSS_ACCOUNT_DISPATCH",
};
const outputPath = process.env.CODEX_PROOF_OUTPUT || "owner-terminal-auth-proof.json";
writeFileSync(outputPath, JSON.stringify(report, null, 2)+"\n", { mode: 0o600 });
console.log("RUNNER_NAME="+report.runner_name);
console.log("RUNNER_SERVICE_COUNT="+services.length);
console.log("CODEX_CLI_AVAILABLE="+cliAvailable);
console.log("CODEX_SIGNED_IN_CONTEXTS="+logged.length);
console.log("CODEX_VERIFIED_DISTINCT_ACCOUNT_COUNT="+verifiedIdentities.length);
console.log("CODEX_VERIFIED_ACCOUNT_TAGS="+verifiedIdentities.join(","));
console.log("CODEX_DUAL_LOGIN_VERIFIED="+report.dual_codex_authorized);
console.log("CODEX_CONTEXTS="+JSON.stringify(codexHomes.map(({path_tag, exists, login, identity, token_expiry})=>({path_tag,exists,login,identity,token_expiry}))));
console.log("NO_AUTH_VALUES_EXPORTED=YES");
