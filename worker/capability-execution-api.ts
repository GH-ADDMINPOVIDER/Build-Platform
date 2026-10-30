import { Hono } from "hono";
import { wrapCapabilityAsUseCard } from "./use-card-policy";
import { boundedReadPrompt } from "./agent-context-policy";
import { hasOwnerSession, hasOwnerOrOpsAccess } from "./app-auth";
import {
  normalizeResolverRequest,
  readResolverCandidates,
  type CapabilityResolverBindings,
  type CapabilityResolverD1,
} from "./capability-resolver-api";
import { resolveCapability, type ResolverRequest } from "./capability-resolver";

type ExecutionBindings = CapabilityResolverBindings & {
  GITHUB_TOKEN?: string;
  GEMINI_API_KEY?: string;
  DEEPSEEK_API_KEY?: string;
  OGENIC_GITHUB_REPO?: string;
  OGENIC_GITHUB_BRANCH?: string;
};
type Env = { Bindings: ExecutionBindings };

type ExecutionBody = ResolverRequest & {
  input?: {
    path?: unknown;
    prompt?: unknown;
  };
};

type GitHubContentResponse = {
  type?: string;
  encoding?: string;
  content?: string;
  sha?: string;
  size?: number;
  path?: string;
  message?: string;
};

type GeminiGenerateResponse = {
  candidates?: Array<{ finishReason?: string; content?: { parts?: Array<{ text?: string }> } }>;
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number };
  modelVersion?: string;
  error?: { message?: string; status?: string };
};

type VerificationState = "verified" | "partially_verified" | "unverified" | "blocked" | "failed";

const CANONICAL_CONVERSATION = "owner-main";
const CANONICAL_SESSION_LINE = "1LSS_OWNER_MAIN";
const CANONICAL_STAGING_BRANCH = "Unified-on-Progress";
const DEFAULT_REPOSITORY = "Wave-Runner-2/Build-Platform";
const SENSITIVE_PATH = /(^|\/)(?:\.env(?:\.|$)|credentials?(?:\.|$)|secrets?(?:\.|$)|id_rsa(?:\.|$)|[^/]+\.(?:pem|p12|pfx|key)$)/i;
const SECRET_LIKE = /(sk-[a-z0-9_-]{12,}|gh[pousr]_[a-z0-9]{12,}|bearer\s+[a-z0-9._~+/=-]{12,}|(?:password|passwd|secret|token|api[_ -]?key)\s*[:=]\s*\S{6,})/i;

const clean = (value: unknown, max: number) => String(value ?? "").trim().slice(0, max);
const makeId = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;

function verification(status: VerificationState, detail: Record<string, unknown> = {}) {
  return { status, ...detail };
}

function safeRepoPath(value: unknown) {
  const path = clean(value, 500).replace(/^\/+/, "");
  if (!path || path.includes("..") || path.includes("\\") || SENSITIVE_PATH.test(path)) return "";
  return path;
}

function encodePath(path: string) {
  return path.split("/").filter(Boolean).map((part) => encodeURIComponent(part)).join("/");
}

function decodeBase64Utf8(value: string) {
  const binary = atob(value.replace(/\s+/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new TextDecoder().decode(bytes);
}

async function sha256Hex(value: string) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function appendCanonicalEvidence(
  db: CapabilityResolverD1,
  runId: string,
  eventKey: string,
  content: string,
) {
  if (!content || SECRET_LIKE.test(content)) throw new Error("SECRET_LIKE_CONTENT_REJECTED");
  const existing = await db.prepare(
    `SELECT sequence_no FROM chat_messages WHERE conversation_id = ? AND idempotency_key = ? LIMIT 1`,
  ).bind(CANONICAL_CONVERSATION, `${eventKey}:0`).first<{ sequence_no: number }>();
  if (existing?.sequence_no) {
    return { sequence: Number(existing.sequence_no), replayed: true };
  }

  const now = Date.now();
  await db.prepare(
    `INSERT OR IGNORE INTO chat_conversations (id, owner_id, title, created_at, updated_at)
     VALUES (?, 'owner', 'OGENIC SAME MIND', ?, ?)`,
  ).bind(CANONICAL_CONVERSATION, now, now).run();
  const next = await db.prepare(
    `UPDATE chat_conversations SET last_sequence = last_sequence + 1, updated_at = ?
     WHERE id = ? RETURNING last_sequence`,
  ).bind(now, CANONICAL_CONVERSATION).first<{ last_sequence: number }>();
  if (!next || !Number.isFinite(Number(next.last_sequence))) throw new Error("1LSS_SEQUENCE_UNAVAILABLE");
  const sequence = Number(next.last_sequence);
  await db.prepare(
    `INSERT INTO chat_messages(
      id, conversation_id, role, content, model, run_id, created_at,
      sequence_no, source_surface, idempotency_key
    ) VALUES (?, ?, 'system', ?, NULL, ?, ?, ?, 'external-harness', ?)`,
  ).bind(makeId("ys_evt"), CANONICAL_CONVERSATION, content, runId, now, sequence, `${eventKey}:0`).run();
  return { sequence, replayed: false };
}

async function runGeminiRead(env: ExecutionBindings, rawPrompt: unknown) {
  const apiKey = clean(env.GEMINI_API_KEY, 4000);
  if (!apiKey) return { ok: false as const, code: "CONFIGURATION_REQUIRED", missing: "GEMINI_API_KEY" };
  const prompt = boundedReadPrompt(rawPrompt);
  if (!prompt) return { ok: false as const, code: "PROMPT_REQUIRED" };

  const model = "gemini-3.7-flash";
  let response: Response;
  try {
    response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: {
          "x-goog-api-key": apiKey,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 2048 },
        }),
      },
    );
  } catch {
    return { ok: false as const, code: "GEMINI_UNREACHABLE", automatic_retry: false };
  }

  const body = await response.json().catch(() => ({})) as GeminiGenerateResponse;
  if (!response.ok) {
    return {
      ok: false as const,
      code: response.status === 429 ? "GEMINI_RATE_LIMITED" : `GEMINI_HTTP_${response.status}`,
      http_status: response.status,
      message: clean(body.error?.message || "Gemini request failed", 300),
      automatic_retry: false,
    };
  }

  const text = clean(
    body.candidates?.[0]?.content?.parts?.map((part) => part.text || "").filter(Boolean).join("\n"),
    40_000,
  );
  if (!text) return { ok: false as const, code: "GEMINI_EMPTY_OUTPUT", http_status: 200 };

  return {
    ok: true as const,
    provider: "gemini",
    capability: "context_load",
    model: clean(body.modelVersion || model, 160),
    finish_reason: clean(body.candidates?.[0]?.finishReason, 80) || null,
    text,
    usage: {
      prompt_tokens: Number(body.usageMetadata?.promptTokenCount ?? 0),
      completion_tokens: Number(body.usageMetadata?.candidatesTokenCount ?? 0),
      total_tokens: Number(body.usageMetadata?.totalTokenCount ?? 0),
    },
    automatic_retry: false,
    provider_fallback: "DENIED_WITHIN_ATTEMPT",
  };
}

type DeepSeekReadResponse = {
  model?: string;
  choices?: Array<{ finish_reason?: string; message?: { content?: string | null } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
};

// One authorized READ only. No retries or fallback; let the provider generate
// naturally, and report finish_reason so incomplete output is never called complete.
async function runDeepSeekRead(env: ExecutionBindings, rawPrompt: unknown) {
  const apiKey = clean(env.DEEPSEEK_API_KEY, 4000);
  if (!apiKey) return { ok: false as const, code: "CONFIGURATION_REQUIRED", missing: "DEEPSEEK_API_KEY" };
  const prompt = boundedReadPrompt(rawPrompt);
  if (!prompt) return { ok: false as const, code: "PROMPT_REQUIRED" };

  let response: Response;
  try {
    response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        model: "deepseek-flash",
        thinking: { type: "disabled" },
        messages: [
          { role: "system", content: "OGENIC Yellow READ reasoning only. Provide a concise evidence-led answer. Never perform writes, retries, or expose secrets." },
          { role: "user", content: prompt },
        ],
        stream: false,
        // Do NOT impose an app-side max_tokens cutoff; provider/model limits still apply.
      }),
    });
  } catch {
    return { ok: false as const, code: "DEEPSEEK_UNREACHABLE", automatic_retry: false };
  }

  // Do not return raw provider errors, which could contain sensitive data.
  const body = await response.json().catch(() => ({})) as DeepSeekReadResponse;
  if (!response.ok) {
    return {
      ok: false as const,
      code: response.status === 402 ? "DEEPSEEK_CREDIT_EXHAUSTED" :
        response.status === 429 ? "DEEPSEEK_RATE_LIMITED" :
        response.status === 401 ? "DEEPSEEK_AUTH_FAILED" :
        `DEEPSEEK_HTTP_${response.status}`,
      http_status: response.status,
      automatic_retry: false,
    };
  }

  // Keep the FULL provider text. The generic 1,200-char summary budget must
  // never clip paid research before Ruby can inspect its evidence.
  const providerContent = body.choices?.[0]?.message?.content;
  const output = typeof providerContent === "string" ? providerContent.trim() : "";
  if (!output) return { ok: false as const, code: "DEEPSEEK_EMPTY_OUTPUT", http_status: 200 };
  return {
    ok: true as const,
    provider: "deepseek",
    capability: "context_load",
    model: clean(body.model || "deepseek-flash", 120),
    finish_reason: clean(body.choices?.[0]?.finish_reason, 80) || null,
    output_complete: body.choices?.[0]?.finish_reason === "stop",
    output_truncated_by_provider: body.choices?.[0]?.finish_reason === "length",
    text: output,
    usage: {
      prompt_tokens: Number(body.usage?.prompt_tokens ?? 0),
      completion_tokens: Number(body.usage?.completion_tokens ?? 0),
      total_tokens: Number(body.usage?.total_tokens ?? 0),
    },
    automatic_retry: false,
    provider_fallback: "DENIED_WITHIN_ATTEMPT",
  };
}

async function readGitHubFile(env: ExecutionBindings, path: string) {
  const token = clean(env.GITHUB_TOKEN, 4000);
  if (!token) return { ok: false as const, code: "CONFIGURATION_REQUIRED", missing: "GITHUB_TOKEN" };

  const repository = clean(env.OGENIC_GITHUB_REPO, 180) || DEFAULT_REPOSITORY;
  const branch = clean(env.OGENIC_GITHUB_BRANCH, 180) || CANONICAL_STAGING_BRANCH;
  if (branch !== CANONICAL_STAGING_BRANCH) {
    return { ok: false as const, code: "ENVIRONMENT_SCOPE_MISMATCH", expected_branch: CANONICAL_STAGING_BRANCH };
  }
  const parts = repository.split("/");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return { ok: false as const, code: "CONFIGURATION_REQUIRED", missing: "OGENIC_GITHUB_REPO" };
  }

  const url = `https://api.github.com/repos/${encodeURIComponent(parts[0])}/${encodeURIComponent(parts[1])}/contents/${encodePath(path)}?ref=${encodeURIComponent(branch)}`;
  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "User-Agent": "ogenic-yellow-stone-staging",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  const body = await response.json().catch(() => ({})) as GitHubContentResponse;
  if (!response.ok) {
    return {
      ok: false as const,
      code: response.status === 404 ? "RESOURCE_NOT_FOUND" : `GITHUB_HTTP_${response.status}`,
      http_status: response.status,
      message: clean(body.message, 160) || "GitHub read failed",
    };
  }
  if (body.type !== "file" || body.encoding !== "base64" || !body.content || !body.sha) {
    return { ok: false as const, code: "UNSUPPORTED_GITHUB_CONTENT", message: "Only base64 GitHub file content is supported" };
  }

  const decoded = decodeBase64Utf8(body.content);
  const redacted = SECRET_LIKE.test(decoded);
  return {
    ok: true as const,
    repository,
    branch,
    path: clean(body.path, 500) || path,
    sha: clean(body.sha, 100),
    size: Number(body.size ?? decoded.length),
    content_excerpt: redacted ? "[CONTENT_REDACTED_SECRET_LIKE]" : decoded.slice(0, 12_000),
    content_truncated: decoded.length > 12_000,
    content_redacted: redacted,
  };
}

export function createCapabilityExecutionApi() {
  const api = new Hono<Env>();

  api.post("/api/capabilities/execute", async (c) => {
    if (!(await hasOwnerOrOpsAccess(c.req.raw, c.env))) {
      return c.json({ ok: false, code: "REAUTH_REQUIRED", role: "owner" }, 401);
    }
    if (!c.env.DB) {
      return c.json({ ok: false, code: "CONFIGURATION_REQUIRED", missing: "D1 binding DB" }, 503);
    }

    const body = await c.req.json<ExecutionBody>().catch(() => ({} as ExecutionBody));
    const request = normalizeResolverRequest(body);
    if (!request.intent && !request.capability && !request.provider) {
      return c.json({ ok: false, code: "INVALID_REQUEST", message: "intent, capability or provider is required" }, 400);
    }

    const candidates = await readResolverCandidates(c.env.DB, c.env);
    const resolved = resolveCapability(request, candidates);
    if (!resolved.ok || !resolved.descriptor) {
      const status = resolved.status === "AMBIGUOUS" ? 409 : resolved.status === "CONFIGURATION_REQUIRED" ? 503 : 404;
      return c.json({
        ok: false,
        code: `RESOLVER_${resolved.status}`,
        resolver: resolved,
        verification: verification("blocked", { reason: resolved.reason ?? "RESOLUTION_FAILED" }),
      }, status, { "Cache-Control": "no-store" });
    }

    const descriptor = resolved.descriptor;
    const useCard = wrapCapabilityAsUseCard(descriptor, "yellow-stone");
    const runId = makeId("ys_run");
    if (descriptor.permission_class !== "READ") {
      // Owner controls authorization, but unimplemented effects cannot execute.
      if (!(await hasOwnerSession(c.req.raw, c.env))) {
        return c.json({ ok: false, code: "REAUTH_REQUIRED", role: "owner" }, 401);
      }
      return c.json({
        ok: false, code: "ADAPTER_NOT_IMPLEMENTED", run_id: runId,
        resolver: resolved, use_card: useCard,
        approval: { required: false, authority: "SIGNED_OWNER_SESSION" },
        verification: verification("blocked", { reason: "NO_IMPLEMENTED_NON_READ_ADAPTER" }),
      }, 501, { "Cache-Control": "no-store" });
    }

    if (descriptor.provider_id === "gemini" && descriptor.capability_id === "context_load") {
      const gemini = await runGeminiRead(c.env, body.input?.prompt ?? request.intent);
      if (!gemini.ok) {
        return c.json({
          ...gemini,
          run_id: runId,
          resolver: resolved,
          use_card: useCard,
          verification: verification("failed", {
            provider_id: "gemini",
            capability_id: "context_load",
          }),
          retention_eligible: false,
        }, gemini.code === "CONFIGURATION_REQUIRED" ? 503 : 502, { "Cache-Control": "no-store" });
      }

      const outputDigest = await sha256Hex(gemini.text);
      return c.json({
        ok: true,
        run_id: runId,
        resolver: resolved,
        use_card: useCard,
        result: gemini,
        verification: verification("partially_verified", {
          provider_id: "gemini",
          capability_id: "context_load",
          output_sha256: outputDigest,
          semantic_verification_required: "RUBY_STONE",
        }),
        retention_eligible: false,
        policy: "READ_AUTO_ALLOW_RUBY_VERIFY_BEFORE_GREEN_RETENTION",
      }, 200, { "Cache-Control": "no-store" });
    }

    if (descriptor.provider_id === "deepseek" && descriptor.capability_id === "context_load") {
      // Paid provider routing is EXPLICIT ONLY; an ordinary ATHENA/Gemini
      // analysis prompt cannot silently incur a DeepSeek completion charge.
      if (request.provider !== "deepseek" || !body.input?.prompt) {
        return c.json({
          ok: false,
          code: "EXPLICIT_DEEPSEEK_SELECTION_AND_PROMPT_REQUIRED",
          run_id: runId,
          use_card: useCard,
          retention_eligible: false,
        }, 409, { "Cache-Control": "no-store" });
      }
      const deepseek = await runDeepSeekRead(c.env, body.input.prompt);
      if (!deepseek.ok) {
        return c.json({
          ...deepseek,
          run_id: runId,
          resolver: resolved,
          use_card: useCard,
          verification: verification("failed", {
            provider_id: "deepseek",
            capability_id: "context_load",
          }),
          retention_eligible: false,
        }, deepseek.code === "CONFIGURATION_REQUIRED" ? 503 : 502, { "Cache-Control": "no-store" });
      }
      const outputDigest = await sha256Hex(deepseek.text);
      return c.json({
        ok: true,
        run_id: runId,
        resolver: resolved,
        use_card: useCard,
        result: deepseek,
        verification: verification(deepseek.output_complete ? "partially_verified" : "unverified", {
          provider_id: "deepseek",
          provider_output_complete: deepseek.output_complete,
          provider_finish_reason: deepseek.finish_reason,
          capability_id: "context_load",
          output_sha256: outputDigest,
          semantic_verification_required: "RUBY_STONE",
        }),
        retention_eligible: false,
        policy: "EXPLICIT_METERED_READ_RUBY_VERIFY_BEFORE_GREEN_RETENTION",
      }, 200, { "Cache-Control": "no-store" });
    }

    if (descriptor.provider_id !== "github" || descriptor.capability_id !== "read_file") {
      return c.json({
        ok: false,
        code: "ADAPTER_NOT_IMPLEMENTED",
        run_id: runId,
        resolver: resolved,
        use_card: useCard,
        verification: verification("blocked", { reason: "NO_SAFE_READ_ADAPTER_FOR_RESOLVED_CAPABILITY" }),
      }, 501, { "Cache-Control": "no-store" });
    }

    const path = safeRepoPath(body.input?.path);
    if (!path) {
      return c.json({
        ok: false,
        code: "INVALID_OR_SENSITIVE_PATH",
        run_id: runId,
        resolver: resolved,
        verification: verification("blocked", { reason: "PATH_REQUIRED_AND_MUST_NOT_TARGET_SECRET_MATERIAL" }),
      }, 400, { "Cache-Control": "no-store" });
    }

    const read = await readGitHubFile(c.env, path);
    if (!read.ok) {
      return c.json({
        ...read,
        run_id: runId,
        resolver: resolved,
        verification: verification("failed", { provider_id: "github", capability_id: "read_file" }),
      }, read.code === "CONFIGURATION_REQUIRED" ? 503 : 502, { "Cache-Control": "no-store" });
    }

    const evidenceKey = await sha256Hex(`${read.repository}|${read.branch}|${read.path}|${read.sha}`);
    const eventKey = `ys_exec_${evidenceKey}`;
    const eventContent = [
      "YELLOW_STONE VERIFIED READ",
      `run=${runId}`,
      "capability=read_file",
      "provider=github",
      `resource=${read.repository}@${read.branch}:${read.path}`,
      `sha=${read.sha}`,
      `bytes=${read.size}`,
      `content_redacted=${read.content_redacted}`,
    ].join(" · ");

    let canonical;
    try {
      canonical = await appendCanonicalEvidence(c.env.DB, runId, eventKey, eventContent);
    } catch (error) {
      return c.json({
        ok: false,
        code: "ONE_LSS_PERSIST_FAILED",
        run_id: runId,
        resolver: resolved,
        result: read,
        verification: verification("partially_verified", {
          provider_id: "github",
          capability_id: "read_file",
          evidence_sha: read.sha,
          persistence_error: clean(error instanceof Error ? error.message : error, 120),
        }),
      }, 503, { "Cache-Control": "no-store" });
    }

    return c.json({
      ok: true,
      run_id: runId,
      resolver: resolved,
      result: read,
      verification: verification("verified", {
        provider_id: "github",
        capability_id: "read_file",
        evidence_sha: read.sha,
      }),
      canonical: {
        conversation_id: CANONICAL_CONVERSATION,
        session_line: CANONICAL_SESSION_LINE,
        sequence: canonical.sequence,
        replayed: canonical.replayed,
      },
      policy: "READ_AUTO_ALLOW_NON_READ_APPROVAL_REQUIRED",
    }, 200, { "Cache-Control": "no-store" });
  });

  return api;
}
