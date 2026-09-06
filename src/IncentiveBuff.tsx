import { useEffect, useMemo, useState } from "react";
import incentives from "../config/provider-incentives.staging.json";

type IncentiveGroup = (typeof incentives.groups)[number];
type TierBucket = "1-2" | "3-5" | "unconfirmed";
type PoolState = "NORMAL" | "WATCH" | "THROTTLE" | "CRITICAL" | "EXHAUSTED";
type TelemetryState = "locked" | "loading" | "ready" | "error";

type PoolSnapshot = {
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

type IncentiveSnapshot = {
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
  thresholds: number[];
  pools: PoolSnapshot[];
  policy_state: "ACTIVE" | "DISABLED" | "EXHAUSTED";
  source: "HARNESS_D1";
};

function compactTokens(value: number) {
  if (value >= 1_000_000) return `${Number((value / 1_000_000).toFixed(2))}M`;
  if (value >= 1_000) return `${Number((value / 1_000).toFixed(1))}K`;
  return String(value);
}

function tierCap(group: IncentiveGroup, tier: TierBucket) {
  if (tier === "1-2") return group.tier_1_2_cap;
  if (tier === "3-5") return group.tier_3_5_cap;
  return null;
}

function countdown(resetAt: string | undefined, timestamp: number) {
  if (!resetAt) return "07:00 ICT";
  const remaining = Math.max(0, new Date(resetAt).getTime() - timestamp);
  const hours = Math.floor(remaining / 3_600_000);
  const minutes = Math.floor((remaining % 3_600_000) / 60_000);
  const seconds = Math.floor((remaining % 60_000) / 1000);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function stateLabel(state: PoolState) {
  if (state === "WATCH") return "80% WATCH";
  if (state === "THROTTLE") return "90% THROTTLE";
  if (state === "CRITICAL") return "95% CRITICAL";
  if (state === "EXHAUSTED") return "CAP REACHED";
  return "NORMAL";
}

function PoolMeter({
  group,
  tier,
  live,
}: {
  group: IncentiveGroup;
  tier: TierBucket;
  live?: PoolSnapshot;
}) {
  const cap = live?.cap ?? tierCap(group, tier);
  const metered = live?.telemetry === "HARNESS_METERED";
  const used = metered ? live.used : null;
  const percent = metered ? Math.max(0, Math.min(100, live.percent ?? 0)) : 0;
  const state = live?.state ?? "NORMAL";
  const capLabel = cap
    ? compactTokens(cap)
    : `${compactTokens(group.tier_1_2_cap)}–${compactTokens(group.tier_3_5_cap)}`;

  return (
    <div className={`buffPool buffPool-${state.toLowerCase()}`}>
      <div className="buffPoolTop">
        <div>
          <span>{group.label}</span>
          <strong>{used === null ? capLabel : `${compactTokens(used)} / ${capLabel}`}</strong>
        </div>
        <small>{metered ? stateLabel(state) : "METER READY"}</small>
      </div>
      <div
        className={`buffTrack ${metered ? "" : "buffTrackPending"}`}
        aria-label={`${group.label} usage ${metered ? `${percent.toFixed(1)} percent` : "awaiting adapter usage keys"}`}
      >
        <span style={metered ? { width: `${percent}%` } : undefined} />
      </div>
      <div className="buffPoolMeta">
        <span>{metered ? `${percent.toFixed(1)}% used · ${compactTokens(live.remaining ?? 0)} left` : "Waiting for metered OpenAI adapter usage"}</span>
        <span>{metered ? live.telemetry : "D1 counter armed"}</span>
      </div>
    </div>
  );
}

export default function IncentiveBuff() {
  const [open, setOpen] = useState(false);
  const [snapshot, setSnapshot] = useState<IncentiveSnapshot | null>(null);
  const [telemetryState, setTelemetryState] = useState<TelemetryState>("locked");
  const [now, setNow] = useState(() => Date.now());
  const tier = incentives.tier as TierBucket;
  const enabled = Boolean(incentives.enabled && incentives.ui.gm_buff);
  const routeLabel = incentives.routing_mode.replaceAll("_", " ").toUpperCase();
  const enrollmentLabel = incentives.enrollment.toUpperCase();

  useEffect(() => {
    let disposed = false;

    const loadTelemetry = async () => {
      const key = sessionStorage.getItem("ogenic_ops_key")?.trim() ?? "";
      if (!key) {
        if (!disposed) {
          setSnapshot(null);
          setTelemetryState("locked");
        }
        return;
      }

      if (!disposed) setTelemetryState((state) => state === "ready" ? state : "loading");
      try {
        const response = await fetch("/api/ops/incentives", {
          headers: { Authorization: `Bearer ${key}` },
          cache: "no-store",
        });
        if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
        const next = await response.json() as IncentiveSnapshot;
        if (!disposed) {
          setSnapshot(next);
          setTelemetryState("ready");
        }
      } catch {
        if (!disposed) setTelemetryState("error");
      }
    };

    void loadTelemetry();
    const poll = window.setInterval(() => void loadTelemetry(), 15_000);
    const onVisibility = () => { if (document.visibilityState === "visible") void loadTelemetry(); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      disposed = true;
      window.clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const livePools = useMemo(
    () => new Map((snapshot?.pools ?? []).map((pool) => [pool.id, pool])),
    [snapshot],
  );

  if (!enabled) return null;

  const resetCountdown = countdown(snapshot?.reset_at, now);
  const telemetryLabel = telemetryState === "ready"
    ? snapshot?.pools.some((pool) => pool.telemetry === "HARNESS_METERED") ? "LIVE METER" : "METER ARMED"
    : telemetryState === "loading" ? "SYNCING"
      : telemetryState === "error" ? "SYNC ERROR"
        : "OPS LOCKED";
  const policyState = snapshot?.policy_state ?? "ACTIVE";

  return (
    <>
      <section className="incentiveDashboard" aria-label="Provider incentive dashboard">
        <div className="incentiveDashboardHeader">
          <div>
            <p>PROVIDER INCENTIVE · STAGING</p>
            <div className="incentiveTitleRow">
              <h2>OpenAI Complimentary Boost</h2>
              <span className="buffBadge buffBadgeOn">{enrollmentLabel}</span>
            </div>
          </div>
          <div className="buffPolicyBadges">
            <span className="buffBadge">{routeLabel}</span>
            <span className="buffBadge">PAID FALLBACK {incentives.paid_fallback ? "ON" : "OFF"}</span>
            <span className="buffBadge">TIER {incentives.usage_tier}</span>
            <span className={`buffBadge ${telemetryState === "ready" ? "buffBadgeOn" : ""}`}>{telemetryLabel}</span>
          </div>
        </div>

        <div className="buffPoolGrid">
          {incentives.groups.map((group) => (
            <PoolMeter key={group.id} group={group} tier={tier} live={livePools.get(group.id)} />
          ))}
        </div>
        <div className="incentiveFootnote incentiveFootnoteSplit">
          <span>Guardian thresholds: 80% watch · 90% throttle · 95% critical · 100% exhausted.</span>
          <strong>RESET IN {resetCountdown}</strong>
        </div>
      </section>

      <div className={`gmBuffDock ${open ? "gmBuffDockOpen" : ""}`}>
        {open && (
          <aside className="gmBuffCard" aria-label="GM buff details">
            <div className="gmBuffCardTop">
              <div>
                <p>GM POLICY AGENT</p>
                <h3>Incentive Guardian</h3>
              </div>
              <span className={`buffBadge ${policyState === "ACTIVE" ? "buffBadgeOn" : "buffBadgeWarn"}`}>BUFF {policyState}</span>
            </div>
            <div className="gmBuffRule"><span>Route</span><strong>Complimentary-first</strong></div>
            <div className="gmBuffRule"><span>Paid fallback</span><strong>{incentives.paid_fallback ? "Policy allows" : "Policy OFF"}</strong></div>
            <div className="gmBuffRule"><span>Telemetry</span><strong>{telemetryLabel}</strong></div>
            <div className="gmBuffRule"><span>Reset countdown</span><strong>{resetCountdown}</strong></div>
            <p className="gmBuffNote">Guardian is isolated from Core logic. Disable the incentive config to remove the buff. It never bypasses approvals, credentials, safety gates, or runtime readiness.</p>
          </aside>
        )}
        <button
          className="gmBuffButton"
          type="button"
          aria-expanded={open}
          aria-label="Toggle GM incentive buff"
          onClick={() => setOpen((value) => !value)}
        >
          <span className="gmBuffGlyph">✦</span>
          <span><strong>{incentives.ui.label}</strong><small>{open ? "CLOSE" : policyState}</small></span>
        </button>
      </div>
    </>
  );
}
