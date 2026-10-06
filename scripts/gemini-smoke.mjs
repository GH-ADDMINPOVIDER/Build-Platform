const key = String(process.env.GEMINI_API_KEY ?? "").trim();
const model = "gemini-3.8-flash";

if (!key) {
  process.stdout.write(JSON.stringify({
    ok: false,
    code: "CONFIGURATION_REQUIRED",
    missing: "GEMINI_API_KEY",
  }) + "\n");
  process.exitCode = 2;
} else {
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: {
          "x-goog-api-key": key,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: "Reply with only GEMINI_OK." }] }],
          generationConfig: { maxOutputTokens: 128 },
        }),
      },
    );

    const body = await response.json().catch(() => ({}));
    const content = body?.candidates?.[0]?.content?.parts
      ?.map((part) => typeof part?.text === "string" ? part.text : "")
      .filter(Boolean)
      .join("\n");
    const finishReason = body?.candidates?.[0]?.finishReason;

    process.stdout.write(JSON.stringify({
      ok: response.status === 200 && typeof content === "string" && content.trim().length > 0,
      http_status: response.status,
      code: response.ok ? null : String(body?.error?.status || "GEMINI_REQUEST_FAILED"),
      model: typeof body?.modelVersion === "string" ? body.modelVersion : model,
      finish_reason: typeof finishReason === "string" ? finishReason : null,
      content_present: typeof content === "string" && content.trim().length > 0,
      total_tokens: Number(body?.usageMetadata?.totalTokenCount ?? 0),
    }) + "\n");

    if (!response.ok || typeof content !== "string" || !content.trim()) process.exitCode = 1;
  } catch {
    process.stdout.write(JSON.stringify({
      ok: false,
      code: "GEMINI_UNREACHABLE",
      http_status: null,
      model,
      content_present: false,
      total_tokens: 0,
    }) + "\n");
    process.exitCode = 1;
  }
}
