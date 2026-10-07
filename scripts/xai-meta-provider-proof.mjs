const clean = (value, max = 300) => String(value ?? "").trim().slice(0, max);

const XAI_KEY = clean(process.env.XAI_API_KEY, 5000);
const META_KEY = clean(process.env.META_MODEL_API_KEY, 5000);

const result = {
  generated_at: new Date().toISOString(),
  policy: "ONE_PASS_NO_AUTO_RETRY_NO_HIDDEN_FALLBACK",
  xai: {
    key_present: Boolean(XAI_KEY),
    models_http_status: null,
    model_access: false,
    inference_http_status: null,
    content_present: false,
    model: null,
    state: XAI_KEY ? "BOUND_NOT_PROVEN" : "CONFIGURATION_REQUIRED",
    code: XAI_KEY ? null : "MISSING_XAI_API_KEY",
  },
  meta_model: {
    key_present: Boolean(META_KEY),
    inference_http_status: null,
    content_present: false,
    model: "muse-spark-1.3",
    state: META_KEY ? "BOUND_NOT_PROVEN" : "CONFIGURATION_REQUIRED",
    code: META_KEY ? null : "MISSING_META_MODEL_API_KEY",
  },
};

async function jsonOrEmpty(response) {
  return response.json().catch(() => ({}));
}

function extractResponsesText(body) {
  const direct = clean(body?.output_text, 4000);
  if (direct) return direct;
  const output = Array.isArray(body?.output) ? body.output : [];
  for (const item of output) {
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const part of content) {
      const text = clean(part?.text ?? part?.content, 4000);
      if (text) return text;
    }
  }
  return "";
}

if (XAI_KEY) {
  try {
    const modelsResponse = await fetch("https://api.x.ai/v1/models", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${XAI_KEY}`,
        Accept: "application/json",
      },
    });
    result.xai.models_http_status = modelsResponse.status;
    const modelsBody = await jsonOrEmpty(modelsResponse);
    const models = Array.isArray(modelsBody?.data) ? modelsBody.data : [];
    const ids = models.map((item) => clean(item?.id, 160)).filter(Boolean);
    const preferred = ids.includes("grok-4.7")
      ? "grok-4.7"
      : ids.find((id) => id.startsWith("grok-4.7"))
        || ids.find((id) => id.startsWith("grok-"))
        || "";
    result.xai.model_access = modelsResponse.ok && Boolean(preferred);
    result.xai.model = preferred || null;

    if (!modelsResponse.ok) {
      result.xai.state = "BLOCKED";
      result.xai.code = `XAI_MODELS_HTTP_${modelsResponse.status}`;
    } else if (!preferred) {
      result.xai.state = "BLOCKED";
      result.xai.code = "XAI_NO_GROK_MODEL_AVAILABLE";
    } else {
      const inferenceResponse = await fetch("https://api.x.ai/v1/responses", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${XAI_KEY}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          model: preferred,
          input: "Reply with only XAI_OK.",
          max_output_tokens: 16,
        }),
      });
      result.xai.inference_http_status = inferenceResponse.status;
      const inferenceBody = await jsonOrEmpty(inferenceResponse);
      const text = extractResponsesText(inferenceBody);
      result.xai.content_present = Boolean(text);
      if (inferenceResponse.ok && text) {
        result.xai.state = "VERIFIED";
        result.xai.code = "XAI_ONE_PASS_OK";
      } else {
        const message = clean(inferenceBody?.error?.message ?? inferenceBody?.message, 300);
        result.xai.state = /billing|payment|credit|balance/i.test(message) ? "BILLING_BLOCKED" : "BLOCKED";
        result.xai.code = `XAI_INFERENCE_HTTP_${inferenceResponse.status}`;
        if (message) result.xai.message = message;
      }
    }
  } catch (error) {
    result.xai.state = "UNREACHABLE";
    result.xai.code = "XAI_REQUEST_FAILED";
    result.xai.message = clean(error?.message ?? error, 300);
  }
}

if (META_KEY) {
  try {
    const metaResponse = await fetch("https://api.meta.ai/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${META_KEY}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        model: "muse-spark-1.3",
        input: "Reply with only META_OK.",
        max_output_tokens: 16,
      }),
    });
    result.meta_model.inference_http_status = metaResponse.status;
    const metaBody = await jsonOrEmpty(metaResponse);
    const text = extractResponsesText(metaBody);
    result.meta_model.content_present = Boolean(text);
    if (metaResponse.ok && text) {
      result.meta_model.state = "VERIFIED";
      result.meta_model.code = "META_ONE_PASS_OK";
    } else {
      const message = clean(metaBody?.error?.message ?? metaBody?.message, 300);
      result.meta_model.state = /billing|payment|credit|balance/i.test(message)
        ? "BILLING_BLOCKED"
        : "BLOCKED";
      result.meta_model.code = `META_INFERENCE_HTTP_${metaResponse.status}`;
      if (message) result.meta_model.message = message;
    }
  } catch (error) {
    result.meta_model.state = "UNREACHABLE";
    result.meta_model.code = "META_REQUEST_FAILED";
    result.meta_model.message = clean(error?.message ?? error, 300);
  }
}

process.stdout.write(JSON.stringify(result, null, 2) + "\n");
