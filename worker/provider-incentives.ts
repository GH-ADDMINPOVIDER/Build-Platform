import incentives from "../config/provider-incentives.staging.json";

type D1Result<T = Record<string, unknown>> = { results?: T[]; success?: boolean };
type D1Prepared = {
  bind: (...values: unknown[]) => D1Prepared;
  all: <T = Record<string, unknown>>() => Promise<D1Result<T>>;
};
export type IncentiveD1 = { prepare: (query: string) => D1Prepared };

type TierBucket = "1-2" | "3-5" | "unconfirmed";
type PoolState = "NORMAL" | "WATCH" | "THROTTLE" | "CRITICAL" | "EXHAUSTED";

type UsageRow = { usage_json: string | null };

type GroupConfig = (typeof incentives.groups)[number];

export type IncentivePoolSnapshot = {
  id: string;
  label: string;
  usage_key: string;
  used: number;
  cap: number | null;
  remaining: number | null;
  percent: number | null;
  state: PoolState;
  telemetry: "HARNESS_METERED" | "AWAITING_ADAPTER_USAGE_KEYS";
};

export type IncentiveSnapshot = {
  ok: true;
  provider: string;
  program: string;
  enabled: boolean;
  enrollment: string;
  usage_tier: number | null;
  tier: TierBucket;
  routing_mode: string;
  paid_fallback: boolean;
  reset_at: string;
  reset_at_utc: string;
  thresholds: readonly number[];
  pools: IncentivePoolSnapshot[];
  policy_state: "ACTIVE" | "DISABLED" | "EXHAUSTED";
  source: "HARNESS_D1";
};

const thresholds = [0.8, 0.9, 0.95] as const;

function utcWindow(timestamp = Date.now()) {
  const date = new Date(timestamp);
  const start = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return { start, end: start + 86_400_000 };
}

function capFor(group: GroupConfig, tier: TierBucket) {
  if (tier === "1-2") return group.tier_1_2_cap;
  if (tier === "3-5") return group.tier_3_5_cap;
  return null;
}

function poolState(percent: number | null): PoolState {
  if (percent === null) return "NORMAL";
  if (percent >= 100) return "EXHAUSTED";
  if (percent >= 95) return "CRITICAL";
  if (percent >= 90) return "THROTTLE";
  if (percent >= 80) return "WATCH";
  return "NORMAL";
}

function parseUsage(text: string | null) {
  if (!text) return {} as Record<string, unknown>;
  try {
    const parsed = JSON.parse(text) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

export async function readIncentiveSnapshot(db?: IncentiveD1, timestamp = Date.now()): Promise<IncentiveSnapshot> {
  const tier = incentives.tier as TierBucket;
  const { start, end } = utcWindow(timestamp);
  const totals = new Map<string, number>();
  let sawMeteredKey = false;

  if (db) {
    const rows = await db
      .prepare("SELECT usage_json FROM runs WHERE created_at >= ? AND created_at < ?")
      .bind(start, end)
      .all<UsageRow>();

    for (const row of rows.results ?? []) {
      const usage = parseUsage(row.usage_json);
      for (const group of incentives.groups) {
        const raw = usage[group.usage_key];
        if (typeof raw === "number" && Number.isFinite(raw) && raw >= 0) {
          sawMeteredKey = true;
          totals.set(group.usage_key, (totals.get(group.usage_key) ?? 0) + raw);
        }
      }
    }
  }

  const pools = incentives.groups.map((group) => {
    const used = Math.floor(totals.get(group.usage_key) ?? 0);
    const cap = capFor(group, tier);
    const remaining = cap === null ? null : Math.max(0, cap - used);
    const percent = cap === null || cap <= 0 ? null : Math.min(100, (used / cap) * 100);
    return {
      id: group.id,
      label: group.label,
      usage_key: group.usage_key,
      used,
      cap,
      remaining,
      percent,
      state: poolState(percent),
      telemetry: sawMeteredKey ? "HARNESS_METERED" as const : "AWAITING_ADAPTER_USAGE_KEYS" as const,
    };
  });

  return {
    ok: true,
    provider: incentives.provider,
    program: incentives.program,
    enabled: incentives.enabled,
    enrollment: incentives.enrollment,
    usage_tier: incentives.usage_tier ?? null,
    tier,
    routing_mode: incentives.routing_mode,
    paid_fallback: incentives.paid_fallback,
    reset_at: new Date(end).toISOString(),
    reset_at_utc: incentives.reset_at_utc,
    thresholds,
    pools,
    policy_state: !incentives.enabled
      ? "DISABLED"
      : pools.every((pool) => pool.state === "EXHAUSTED")
        ? "EXHAUSTED"
        : "ACTIVE",
    source: "HARNESS_D1",
  };
}
