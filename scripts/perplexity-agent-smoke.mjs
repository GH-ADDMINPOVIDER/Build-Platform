import Perplexity from "@perplexity-ai/perplexity_ai";

const key = String(process.env.PERPLEXITY_API_KEY ?? "").trim();
if (!key) {
  process.stdout.write(JSON.stringify({
    ok: false,
    code: "CONFIGURATION_REQUIRED",
    missing: "PERPLEXITY_API_KEY",
  }) + "\n");
  process.exitCode = 2;
} else {
  const client = new Perplexity({
    apiKey: key,
    maxRetries: 0,
    timeout: 60_000,
    logLevel: "off",
  });

  try {
    const response = await client.responses.create({
      preset: "fast",
      input: "What is the current official Perplexity Agent API endpoint? Answer in one sentence.",
      tools: [{ type: "web_search" }],
      store: false,
    });
    const sourceCount = Array.isArray(response.output)
      ? response.output.reduce((count, item) => count + (item?.type === "search_results" && Array.isArray(item.results) ? item.results.length : 0), 0)
      : 0;
    process.stdout.write(JSON.stringify({
      ok: response.status === "completed",
      status: response.status,
      object: response.object,
      model: response.model,
      output_text_present: Boolean(String(response.output_text ?? "").trim()),
      source_count: sourceCount,
    }) + "\n");
  } catch (error) {
    const status = Number(error?.status ?? 0);
    const retryAfter = error?.headers instanceof Headers
      ? error.headers.get("retry-after")
      : null;
    process.stdout.write(JSON.stringify({
      ok: false,
      code: status === 401 ? "PERPLEXITY_AUTH_FAILED" : status === 429 ? "PERPLEXITY_RATE_LIMITED" : "PERPLEXITY_REQUEST_FAILED",
      http_status: status || null,
      retry_after: retryAfter || null,
    }) + "\n");
    process.exitCode = 1;
  }
}
