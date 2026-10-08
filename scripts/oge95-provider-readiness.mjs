// OGE-95: non-billable connectivity probe. GET only; do not create Agent sessions or Manus tasks.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
const endpoints = {
  manus: "https://api.manus.ai/v2/user.me",
  openai: "https://api.openai.com/v1/agents/sessions?limit=1",
};
export async function probeProviderReadiness(env = process.env, fetcher = fetch) {
  const output = {
    schema: "OGE95_PROVIDER_READINESS_V1",
    checked_at: new Date().toISOString(),
    paid_agent_tasks_created: false,
    model_inference_calls: 0,
    manus: { state: "NOT_CONFIGURED", transport: "MANUS_DIRECT_API_V2" },
    // ChatGPT Manus plugin/MCP is a separate authenticated transport outside CI.
    // Absence of MANUS_API_KEY only says the direct API binding is missing.
    manus_plugin: { state: "EXTERNAL_PLUGIN_NOT_PROBED", transport: "CHATGPT_MANUS_PLUGIN_MCP" },
    openai: { state: "NOT_CONFIGURED" }
  };
  const pairs = [
    ["manus", env.MANUS_API_KEY, { "x-manus-api-key": env.MANUS_API_KEY ?? "" }],
    ["openai", env.OPENAI_API_KEY, {
      Authorization: "Bearer " + (env.OPENAI_API_KEY ?? ""),
      "OpenAI-Beta": "agents=v1"
    }]
  ];
  for (const [provider, key, headers] of pairs) {
    if (!String(key ?? "").trim()) continue;
    try {
      const res = await fetcher(endpoints[provider], {
        method: "GET",
        headers,
        signal: AbortSignal.timeout(10000)
      });
      output[provider] = {
        ...(provider === "manus" ? { transport: "MANUS_DIRECT_API_V2" } : {}),
        state: res.status === 200 ? "READ_ACCESS_OK"
          : [401, 403].includes(res.status) ? "AUTH_DENIED"
          : res.status === 429 ? "RATE_LIMITED" : "READ_ERROR",
        http_status: res.status
      };
      // Deliberately do not read provider body, list session IDs or display user data.
      await res.body?.cancel().catch(() => {});
    } catch {
      output[provider] = { state: "NETWORK_UNAVAILABLE", ...(provider === "manus" ? { transport: "MANUS_DIRECT_API_V2" } : {}) };
    }
  }
  return output;
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const result = await probeProviderReadiness();
  const output = process.argv.find((x) => x.startsWith("--output="))?.slice(9);
  if (output) writeFileSync(output, JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify(result, null, 2));
}
