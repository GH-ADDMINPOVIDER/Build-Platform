export type RubyState = "PASS" | "FAIL" | "BLOCKED" | "NOT_MEASURED";
export type RubyDomain =
  | "continuity"
  | "admission"
  | "planning"
  | "multi_agent"
  | "routing"
  | "approval"
  | "evidence"
  | "runtime"
  | "security";

export type CapDimension = "CODE_BUILDER" | "DEBUG_BUILD" | "AUDITOR" | "ACCURACY";
export type MetricState = "MEASURED" | "NOT_MEASURED";

export type RubyCapabilityTest = {
  state: RubyState;
  domain: RubyDomain;
  agent_id: string | null;
  provider: string;
  runtime: string;
  evidence_ref: string;
};

export type CapMetric = {
  dimension: CapDimension;
  state: MetricState;
  score: number | null;
  pass: number;
  fail: number;
  sample_size: number;
  evidence_refs: string[];
};

export type CapSig = {
  schema: "OGENIC_CAPSIG_V1";
  generated_by: "RUBY_STONE";
  self_scored: false;
  agent_id: string;
  environment: string;
  provider: string;
  runtime: string;
  dimensions: Record<CapDimension, CapMetric>;
  evidence_refs: string[];
};

export type CapRankRow = {
  agent_id: string;
  environment: string;
  dimension: CapDimension;
  state: MetricState;
  score: number | null;
  sample_size: number;
  rank: number | null;
};

const SECRET_PATTERN = /(sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9_-]{12,}|bearer\s+[A-Za-z0-9._~+/=-]{12,}|api[_-]?key|access[_-]?token|refresh[_-]?token|password)/i;

const DIMENSIONS: Record<Exclude<CapDimension, "ACCURACY">, RubyDomain[]> = {
  CODE_BUILDER: ["planning", "multi_agent", "routing"],
  DEBUG_BUILD: ["continuity", "runtime"],
  AUDITOR: ["admission", "approval", "evidence", "security"],
};

function clean(value: unknown, max = 240) {
  return String(value ?? "").trim().slice(0, max);
}

function unique(values: string[]) {
  return [...new Set(values)];
}

function measuredMetric(dimension: CapDimension, tests: RubyCapabilityTest[]): CapMetric {
  const measured = tests.filter((test) => test.state === "PASS" || test.state === "FAIL");
  const pass = measured.filter((test) => test.state === "PASS").length;
  const fail = measured.filter((test) => test.state === "FAIL").length;
  const sampleSize = pass + fail;
  const evidenceRefs = unique(
    measured.map((test) => clean(test.evidence_ref, 500)).filter((ref) => ref && !SECRET_PATTERN.test(ref)),
  );
  return {
    dimension,
    state: sampleSize ? "MEASURED" : "NOT_MEASURED",
    score: sampleSize ? Number(((pass / sampleSize) * 100).toFixed(1)) : null,
    pass,
    fail,
    sample_size: sampleSize,
    evidence_refs: evidenceRefs,
  };
}

export function buildCapSig(input: {
  agent_id: string;
  environment: string;
  provider: string;
  runtime: string;
  tests: RubyCapabilityTest[];
  source_verifier: "RUBY_STONE";
  scorer_agent_id?: string | null;
}): CapSig {
  const agentId = clean(input.agent_id, 160);
  const environment = clean(input.environment, 120);
  const provider = clean(input.provider, 120);
  const runtime = clean(input.runtime, 160);
  if (!agentId) throw new Error("AGENT_ID_REQUIRED");
  if (!environment) throw new Error("ENVIRONMENT_REQUIRED");
  if (input.source_verifier !== "RUBY_STONE") throw new Error("RUBY_EVIDENCE_REQUIRED");
  if (clean(input.scorer_agent_id, 160) && clean(input.scorer_agent_id, 160) === agentId) {
    throw new Error("SELF_SCORE_DENIED");
  }

  const owned = input.tests.filter((test) => test.agent_id === agentId);
  const secretLike = owned.some((test) => SECRET_PATTERN.test(String(test.evidence_ref ?? "")));
  if (secretLike) throw new Error("SECRET_LIKE_EVIDENCE_REJECTED");

  const codeBuilder = measuredMetric("CODE_BUILDER", owned.filter((test) => DIMENSIONS.CODE_BUILDER.includes(test.domain)));
  const debugBuild = measuredMetric("DEBUG_BUILD", owned.filter((test) => DIMENSIONS.DEBUG_BUILD.includes(test.domain)));
  const auditor = measuredMetric("AUDITOR", owned.filter((test) => DIMENSIONS.AUDITOR.includes(test.domain)));
  const accuracy = measuredMetric("ACCURACY", owned);

  const dimensions = {
    CODE_BUILDER: codeBuilder,
    DEBUG_BUILD: debugBuild,
    AUDITOR: auditor,
    ACCURACY: accuracy,
  } satisfies Record<CapDimension, CapMetric>;

  return {
    schema: "OGENIC_CAPSIG_V1",
    generated_by: "RUBY_STONE",
    self_scored: false,
    agent_id: agentId,
    environment,
    provider,
    runtime,
    dimensions,
    evidence_refs: unique(Object.values(dimensions).flatMap((metric) => metric.evidence_refs)),
  };
}

export function rankCapSigs(
  signatures: CapSig[],
  input: { dimension: CapDimension; environment: string },
): CapRankRow[] {
  const environment = clean(input.environment, 120);
  const rows = signatures
    .filter((signature) => signature.generated_by === "RUBY_STONE" && signature.self_scored === false)
    .filter((signature) => signature.environment === environment)
    .map((signature) => {
      const metric = signature.dimensions[input.dimension];
      return {
        agent_id: signature.agent_id,
        environment: signature.environment,
        dimension: input.dimension,
        state: metric.state,
        score: metric.score,
        sample_size: metric.sample_size,
        rank: null,
      } satisfies CapRankRow;
    })
    .sort((left, right) => {
      if (left.state !== right.state) return left.state === "MEASURED" ? -1 : 1;
      if (left.score !== right.score) return Number(right.score ?? -1) - Number(left.score ?? -1);
      if (left.sample_size !== right.sample_size) return right.sample_size - left.sample_size;
      return left.agent_id.localeCompare(right.agent_id);
    });

  let rank = 0;
  return rows.map((row) => {
    if (row.state !== "MEASURED") return row;
    rank += 1;
    return { ...row, rank };
  });
}

// CapSig/CapRank V1 is a pure Ruby-evidence calculation layer.
// It does not execute providers, write D1, or accept model-name-only ranking.
