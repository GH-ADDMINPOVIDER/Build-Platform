/**
 * OGE-95 Moli: optional read-only public browser smoke on the EXISTING runner.
 * Only explicitly allowlisted HTTPS origins may be visited.
 * This is NOT a Plugin/MCP replacement, authenticated browser, or generic URL proxy.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

export const adapter = JSON.parse(readFileSync(new URL("../../config/moli-browser-adapter.json", import.meta.url), "utf8"));

export function planMoliFetch({ url, sourceSha, binary } = {}) {
  if (!/^[0-9a-f]{40}$/i.test(sourceSha ?? "")) throw Error("CANONICAL_SHA_REQUIRED");
  if (typeof binary !== "string" || !binary.startsWith("/") || binary.includes("\0") || binary.length > 350)
    throw Error("ABSOLUTE_MOLI_BINARY_REQUIRED");
  let dest;
  try { dest = new URL(url); } catch { throw Error("VALID_URL_REQUIRED"); }
  if (dest.protocol !== "https:" || dest.username || dest.password || dest.port || dest.hash)
    throw Error("PUBLIC_HTTPS_ONLY");
  if (!adapter.allowed_smoke_origins.includes(dest.origin) || dest.pathname !== "/" || dest.search)
    throw Error("ORIGIN_OR_PATH_NOT_ALLOWLISTED");
  return {
    command: binary,
    args: ["fetch", "--dump", "markdown", "--wait-until", "done", dest.toString()],
    url: dest.toString(),
    source_sha: sourceSha,
    upstream_version: adapter.pinned_version,
    release_sha256: adapter.release_sha256,
  };
}

export function runMoliSmoke(plan, executor = execFileSync) {
  if (!plan?.url || !plan?.source_sha) throw Error("PLAN_REQUIRED");
  const body = executor(plan.command, plan.args, {
    encoding: "utf8",
    timeout: 45000,
    maxBuffer: 1024 * 256,
    // Never pass API keys or owner credentials to the external browser process.
    env: {
      PATH: process.env.PATH || "/usr/bin:/bin",
      HOME: process.env.RUNNER_TEMP || "/tmp",
      LANG: "C.UTF-8",
    },
  });
  const text = String(body ?? "");
  if (!text.includes("Example Domain") || !text.trim()) throw Error("MOLI_PUBLIC_CONTENT_MISMATCH");
  return {
    schema: "OGE95_MOLI_BROWSER_SMOKE_V1",
    ok: true,
    task: "READ_ONLY_PUBLIC_BROWSER_TEST",
    browser: "Moli",
    source_sha: plan.source_sha,
    binary_version: plan.upstream_version,
    binary_sha256: plan.release_sha256,
    target: plan.url,
    content_sha256: createHash("sha256").update(text).digest("hex"),
    visible_expected_text: true,
    content_bytes: Buffer.byteLength(text),
    paid_cloud_sessions: 0,
    llm_calls: 0,
    credentials_forwarded: false,
    plugin_routes_modified: false,
    production_browser_replaced: false,
    yellow_execution_authority_unchanged: true,
    ruby_verification: "PENDING",
  };
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const opt = (key, fallback = "") =>
    process.argv.find((a) => a.startsWith("--" + key + "="))?.slice(key.length + 3) ?? fallback;
  const plan = planMoliFetch({
    url: opt("url", "https://example.com/"),
    binary: opt("binary"),
    sourceSha: opt("sha", process.env.GITHUB_SHA || ""),
  });
  const result = runMoliSmoke(plan);
  const out = opt("output", "oge95-moli-browser-smoke.json");
  if (!/^[a-zA-Z0-9_./-]{1,160}$/.test(out)) throw Error("INVALID_OUTPUT_PATH");
  writeFileSync(out, JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify({ status: "MOLI_PUBLIC_SMOKE_PASS", source_sha: result.source_sha, output: out }));
}
