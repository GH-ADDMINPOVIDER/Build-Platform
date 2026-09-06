import { useMemo, useState } from "react";
import incentives from "../config/provider-incentives.staging.json";

type IncentiveGroup = (typeof incentives.groups)[number];

type TierBucket = "1-2" | "3-5" | "unconfirmed";

function compactTokens(value: number) {
  if (value >= 1_000_000) return `${value / 1_000_000}M`;
  if (value >= 1_000) return `${value / 1_000}K`;
  return String(value);
}

function tierCap(group: IncentiveGroup, tier: TierBucket) {
  if (tier === "1-2") return group.tier_1_2_cap;
  if (tier === "3-5") return group.tier_3_5_cap;
  return null;
}

function PoolMeter({ group, tier }: { group: IncentiveGroup; tier: TierBucket }) {
  const cap = tierCap(group, tier);
  const capLabel = cap
    ? compactTokens(cap)
    : `${compactTokens(group.tier_1_2_cap)}–${compactTokens(group.tier_3_5_cap)}`;

  return (
    <div className="buffPool">
      <div className="buffPoolTop">
        <div>
          <span>{group.label}</span>
          <strong>{capLabel}</strong>
        </div>
        <small>{cap ? "DAILY CAP" : "TIER RANGE"}</small>
      </div>
      <div className="buffTrack buffTrackPending" aria-label={`${group.label} limit meter waiting for provider usage telemetry`}>
        <span />
      </div>
      <div className="buffPoolMeta">
        <span>Harness metering pending</span>
        <span>Reset 07:00 ICT</span>
      </div>
    </div>
  );
}

export default function IncentiveBuff() {
  const [open, setOpen] = useState(false);
  const tier = incentives.tier as TierBucket;
  const enabled = Boolean(incentives.enabled && incentives.ui.gm_buff);
  const routeLabel = incentives.routing_mode.replaceAll("_", " ").toUpperCase();
  const enrollmentLabel = incentives.enrollment.toUpperCase();

  const poolSummary = useMemo(
    () => incentives.groups.map((group) => ({ group, cap: tierCap(group, tier) })),
    [tier],
  );

  if (!enabled) return null;

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
            <span className="buffBadge">TIER {tier === "unconfirmed" ? "PENDING" : tier}</span>
          </div>
        </div>

        <div className="buffPoolGrid">
          {poolSummary.map(({ group }) => (
            <PoolMeter key={group.id} group={group} tier={tier} />
          ))}
        </div>
        <div className="incentiveFootnote">
          Limit bars are wired as a removable UI layer. Provider usage remains the source of truth until Harness token telemetry is bound.
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
              <span className="buffBadge buffBadgeOn">BUFF ACTIVE</span>
            </div>
            <div className="gmBuffRule">
              <span>Route</span>
              <strong>Complimentary-first</strong>
            </div>
            <div className="gmBuffRule">
              <span>Paid overage</span>
              <strong>{incentives.paid_fallback ? "Allowed" : "Blocked"}</strong>
            </div>
            <div className="gmBuffRule">
              <span>Reset</span>
              <strong>00:00 UTC · 07:00 ICT</strong>
            </div>
            <p className="gmBuffNote">This is a routing/cost buff only. It does not bypass approvals, credentials, safety gates, or runtime readiness.</p>
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
          <span><strong>{incentives.ui.label}</strong><small>{open ? "CLOSE" : "ACTIVE"}</small></span>
        </button>
      </div>
    </>
  );
}
