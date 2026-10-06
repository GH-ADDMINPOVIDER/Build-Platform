const key = String(process.env.DEEPSEEK_API_KEY ?? "").trim();

if (!key) {
  process.stdout.write(JSON.stringify({
    ok: false,
    code: "CONFIGURATION_REQUIRED",
    missing: "DEEPSEEK_API_KEY",
  }) + "\n");
  process.exitCode = 2;
} else {
  try {
    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        model: "deepseek-flash",
        messages: [{ role: "user", content: "Reply with only DEEPSEEK_OK." }],
        stream: false,
        max_tokens: 16,
      }),
    });

    const body = await response.json().catch(() => ({}));
    const content = body?.choices?.[0]?.message?.content;
    process.stdout.write(JSON.stringify({
      ok: response.status === 200 && typeof content === "string" && content.trim().length > 0,
      http_status: response.status,
      model: typeof body?.model === "string" ? body.model : null,
      finish_reason: typeof body?.choices?.[0]?.finish_reason === "string" ? body.choices[0].finish_reason : null,
      content_present: typeof content === "string" && content.trim().length > 0,
      total_tokens: Number(body?.usage?.total_tokens ?? 0),
    }) + "\n");
    if (!response.ok || typeof content !== "string" || !content.trim()) process.exitCode = 1;
  } catch {
    process.stdout.write(JSON.stringify({
      ok: false,
      code: "DEEPSEEK_UNREACHABLE",
      http_status: null,
    }) + "\n");
    process.exitCode = 1;
  }
}
