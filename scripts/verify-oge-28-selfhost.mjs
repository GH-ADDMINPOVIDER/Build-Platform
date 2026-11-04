import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";

const apiKey = String(process.env.OPENAI_API_KEY ?? "").trim();
const opsKey = String(process.env.OGENIC_OPS_KEY ?? "").trim();
const sessionId = String(process.env.SESSION_ID ?? "").trim();
const environmentId = String(process.env.ENVIRONMENT_ID ?? "").trim();
const stagingUrl = String(process.env.STAGING_URL ?? "https://wave.ogenicchocolate.com").replace(/\/$/, "");
const resultPath = String(process.env.RESULT_PATH ?? "oge28-selfhost-proof.json");
const branch = "Unified-on-Progress";
const conversationId = "owner-main";
const sessionLine = "1LSS_OWNER_MAIN";
const secretLike = /(sk-[a-z0-9_-]{12,}|gh[pousr]_[a-z0-9]{12,}|bearer\s+[a-z0-9._~+/=-]{12,}|BEGIN (?:RSA|OPENSSH|EC) PRIVATE KEY|(?:password|passwd|secret|token|api[_ -]?key)\s*[:=]\s*\S{6,})/i;
const safePrefix = /^UNIFIEND_SELFHOST_PROOF_OK(?:\s|$)/m;

function requireValue(name, value) {
  if (!value) throw new Error(`CONFIGURATION_REQUIRED:${name}`);
}

requireValue("OPENAI_API_KEY", apiKey);
requireValue("OGENIC_OPS_KEY", opsKey);
if (!(sessionId.startsWith("sess_") || sessionId.startsWith("agent_"))) throw new Error("INVALID_SESSION_ID");
if (!environmentId.startsWith("ccarenv_")) throw new Error("INVALID_ENVIRONMENT_ID");

const headers = {
  Authorization: `Bearer ${apiKey}`,
  "OpenAI-Beta": "agents=v1",
  "Content-Type": "application/json",
};

const prompt = [
  "Run read-only local commands only:",
  "1. pwd",
  "2. git rev-parse HEAD",
  "3. git branch --show-current",
  "4. codex --version",
  "Do not modify files. Do not access secrets. Do not use network tools.",
  "Return one final line beginning UNIFIEND_SELFHOST_PROOF_OK followed by the four verified values.",
].join("\n");

const abort = new AbortController();
const timeout = setTimeout(() => abort.abort(new Error("AGENT_EVENT_TIMEOUT")), 12 * 60 * 1000);

function consumeEvent(event, state) {
  state.usageTokens = Math.max(
    state.usageTokens,
    Number(event?.usage?.total_tokens ?? 0),
    Number(event?.turn?.usage?.total_tokens ?? 0),
  );
  if (event?.type === "agent.session.turn.output_text.delta" && typeof event.delta === "string") state.streamed += event.delta;
  if (event?.type === "agent.session.turn.output_text.done" && typeof event.text === "string") state.final = event.text.trim();
  if (event?.type === "agent.session.turn.item.done" && event?.item?.type === "message") {
    const text = (event.item.content ?? [])
      .filter((part) => part?.type === "output_text" && typeof part.text === "string")
      .map((part) => part.text)
      .join("\n")
      .trim();
    if (text) {
      state.fallback = text;
      if (event.item.phase === "final_answer") state.final = text;
    }
  }
  const root = event?.turn?.subagent_id == null;
  if (event?.type === "agent.session.turn.completed" && root) state.terminal = "completed";
  if (event?.type === "agent.session.turn.cancelled" && root) state.terminal = "cancelled";
  if ((event?.type === "agent.session.turn.failed" && root)
      || event?.type === "agent.session.failed"
      || event?.type === "agent.session.environment.failed"
      || event?.type === "error") {
    state.terminal = "failed";
    const err = event?.turn?.error ?? event?.error;
    state.error = typeof err === "string" ? err : String(err?.message ?? err?.code ?? "AGENT_SESSION_FAILED");
  }
}

async function streamUntilTerminal(response) {
  if (!response.ok || !response.body) throw new Error(`OPENAI_EVENT_STREAM_HTTP_${response.status}`);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const state = { terminal: "", final: "", streamed: "", fallback: "", error: "", usageTokens: 0 };
  try {
    while (!state.terminal) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
      let split = buffer.indexOf("\n\n");
      while (split >= 0) {
        const block = buffer.slice(0, split);
        buffer = buffer.slice(split + 2);
        for (const line of block.split("\n")) {
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;
          try { consumeEvent(JSON.parse(payload), state); } catch { /* keepalive */ }
        }
        if (state.terminal) break;
        split = buffer.indexOf("\n\n");
      }
    }
  } finally {
    try { await reader.cancel(); } catch { /* noop */ }
  }
  if (!state.terminal) throw new Error("AGENT_EVENT_STREAM_CLOSED_BEFORE_TERMINAL");
  if (state.terminal !== "completed") throw new Error(`AGENT_${state.terminal.toUpperCase()}:${state.error || "unknown"}`);
  return { text: state.final || state.streamed.trim() || state.fallback, usageTokens: state.usageTokens };
}

try {
  const streamPromise = fetch(`https://api.openai.com/v1/agents/sessions/${encodeURIComponent(sessionId)}/events`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "OpenAI-Beta": "agents=v1",
      Accept: "text/event-stream",
    },
    signal: abort.signal,
  });
  const stream = await streamPromise;

  const submitted = await fetch(`https://api.openai.com/v1/agents/sessions/${encodeURIComponent(sessionId)}/events`, {
    method: "POST",
    headers: {
      ...headers,
      "Idempotency-Key": `oge28_input_${sessionId}`,
    },
    body: JSON.stringify({
      events: [{
        type: "agent.session.input.message",
        input: [{ role: "user", content: [{ type: "input_text", text: prompt }] }],
      }],
    }),
    signal: abort.signal,
  });
  if (submitted.status !== 202 && !submitted.ok) {
    const body = await submitted.text().catch(() => "");
    throw new Error(`OPENAI_AGENT_INPUT_HTTP_${submitted.status}:${body.slice(0, 240)}`);
  }

  const result = await streamUntilTerminal(stream);
  if (!safePrefix.test(result.text)) throw new Error("SELFHOST_PROOF_OUTPUT_UNVERIFIED");
  if (secretLike.test(result.text)) throw new Error("SECRET_LIKE_OUTPUT_REJECTED");
  const resultSha256 = createHash("sha256").update(result.text).digest("hex");

  const evidenceContent = [
    "OGE-28 VERIFIED SELF-HOST EXECUTION",
    `session=${sessionId}`,
    `environment=${environmentId}`,
    "runner=wave-runner-01",
    `branch=${branch}`,
    `result_sha256=${resultSha256}`,
    `session_line=${sessionLine}`,
  ].join(" | ");
  if (secretLike.test(evidenceContent)) throw new Error("SECRET_LIKE_EVIDENCE_REJECTED");

  const stamped = await fetch(`${stagingUrl}/api/1lss/event`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-OGENIC-Ops-Key": opsKey,
      "Idempotency-Key": `oge28:${sessionId}`,
    },
    body: JSON.stringify({
      source_surface: "external-harness",
      events: [{ role: "system", content: evidenceContent }],
    }),
    signal: abort.signal,
  });
  const stampBody = await stamped.json().catch(() => ({}));
  if (!stamped.ok || stampBody?.ok !== true || !Array.isArray(stampBody?.sequences) || !Number.isFinite(Number(stampBody.sequences[0]))) {
    throw new Error(`1LSS_EVIDENCE_STAMP_FAILED:${stamped.status}`);
  }

  const safe = {
    ok: true,
    issue: "OGE-28",
    verification: "verified",
    agent_session_id: sessionId,
    environment_id: environmentId,
    runner: "wave-runner-01",
    branch,
    result_sha256: resultSha256,
    evidence_sequence: Number(stampBody.sequences[0]),
    evidence_replayed: Number(stampBody.replayed_count ?? 0) > 0,
    conversation_id: conversationId,
    session_line: sessionLine,
    usage_tokens: Number(result.usageTokens ?? 0),
    policy: "STAGING_ONLY · READ_ONLY_PROOF · EVIDENCE_TO_1LSS",
  };
  await writeFile(resultPath, `${JSON.stringify(safe, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(safe));
} finally {
  clearTimeout(timeout);
}
