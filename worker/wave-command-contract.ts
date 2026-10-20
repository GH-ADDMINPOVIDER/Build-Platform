export type WaveCommandMode = "autonomous" | "read" | "execute" | "team";

export type WaveCommandInput = {
  path?: string;
  prompt?: string;
};

export type NormalizedWaveCommand = {
  ok: true;
  mode: WaveCommandMode;
  intent: string;
  capability: string;
  provider: string;
  environment: "staging";
  input: WaveCommandInput;
  explicit_structured: boolean;
};

type InvalidWaveCommand = {
  ok: false;
  code: "INVALID_REQUEST" | "ENVIRONMENT_SCOPE_MISMATCH" | "SECRET_LIKE_INPUT_REJECTED";
  message: string;
};

const SECRET_LIKE = /(?:password|passwd|secret|token|api[_ -]?key|private[_ -]?key|credential|cookie|session[_ -]?key|รหัสผ่าน|โทเคน|ซีเคร็ต)/i;
const URL_LIKE = /https?:\/\//i;

const compact = (value: unknown, max: number) => String(value ?? "").trim().replace(/\s+/g, " ").slice(0, max);

function mode(value: unknown): WaveCommandMode | null {
  const valueText = compact(value, 20).toLowerCase();
  if (!valueText) return "autonomous";
  if (valueText === "auto" || valueText === "autonomous") return "autonomous";
  if (valueText === "read") return "read";
  if (valueText === "execute" || valueText === "write") return "execute";
  if (valueText === "team" || valueText === "orchestrate") return "team";
  return null;
}

export function normalizeWaveCommandBody(raw: unknown): NormalizedWaveCommand | InvalidWaveCommand {
  if (!raw || typeof raw !== "object") {
    return { ok: false, code: "INVALID_REQUEST", message: "JSON command body required" };
  }

  const body = raw as Record<string, unknown>;
  const input = body.input && typeof body.input === "object"
    ? body.input as Record<string, unknown>
    : {};

  const command = compact(body.command ?? body.intent, 1200);
  const capability = compact(body.capability, 160);
  const provider = compact(body.provider, 120);
  const environment = compact(body.environment, 40);
  const selectedMode = mode(body.mode ?? body.command_mode);
  const inputPath = compact(input.path, 500);
  const inputPrompt = compact(input.prompt, 6000);

  if (!selectedMode) {
    return { ok: false, code: "INVALID_REQUEST", message: "mode must be autonomous, read, execute, or team" };
  }
  if (environment && environment !== "staging") {
    return { ok: false, code: "ENVIRONMENT_SCOPE_MISMATCH", message: "WAVE Command is staging-only" };
  }
  if (!command && !capability && !provider) {
    return { ok: false, code: "INVALID_REQUEST", message: "command, capability or provider is required" };
  }
  if ([command, capability, provider, inputPath, inputPrompt].some((value) => SECRET_LIKE.test(value) || URL_LIKE.test(value))) {
    return { ok: false, code: "SECRET_LIKE_INPUT_REJECTED", message: "credential-like or arbitrary URL input is not allowed" };
  }

  return {
    ok: true,
    mode: selectedMode,
    intent: command,
    capability,
    provider,
    environment: "staging",
    input: {
      path: inputPath || undefined,
      prompt: inputPrompt || undefined,
    },
    explicit_structured: Boolean(capability || provider),
  };
}

export function waveCommandPolicy(modeValue: WaveCommandMode) {
  return {
    mode: modeValue,
    control_plane: "WAVE",
    planner: "ATHENA",
    execution_authority: "YELLOW_STONE_ONLY", // legacy tools route, not Owner authority
    owner_decision_authority: "SIGNED_OWNER_SESSION",
    yellow_stone_role: "TOOLS_ADAPTER_ONLY",
    canonical_memory: "owner-main / 1LSS_OWNER_MAIN",
    non_read_behavior: "OWNER_SESSION_DIRECT_WHEN_ADAPTER_AVAILABLE",
    direct_execution_bypass: false,
  } as const;
}
