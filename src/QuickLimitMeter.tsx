import { useCallback, useEffect, useMemo, useState } from "react";

type Pool = {
  id: string;
  label: string;
  used: number;
  cap: number | null;
  remaining: number | null;
  percent: number | null;
  state: string;
};

type DashboardResponse = {
  incentives?: {
    policy_state?: string;
    pools?: Pool[];
  };
};

export default function QuickLimitMeter() {
  const [pools, setPools] = useState<Pool[]>([]);
  const [policy, setPolicy] = useState("LOADING");
  const [visible, setVisible] = useState(false);
  const [collapsed, setCollapsed] = useState(() => typeof window !== "undefined" && window.matchMedia("(max-width: 820px)").matches);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/dashboard", {
        cache: "no-store",
        credentials: "same-origin",
      });
      if (response.status === 401) {
        setVisible(false);
        return;
      }
      if (!response.ok) return;
      const body = await response.json() as DashboardResponse;
      const nextPools = body.incentives?.pools ?? [];
      setPools(nextPools);
      setPolicy(body.incentives?.policy_state ?? "ACTIVE");
      setVisible(nextPools.length > 0);
    } catch {
      // Telemetry only: keep the last known snapshot.
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 30_000);
    const onFocus = () => void refresh();
    const media = window.matchMedia("(max-width: 820px)");
    const onViewportChange = (event: MediaQueryListEvent) => setCollapsed(event.matches);
    window.addEventListener("focus", onFocus);
    media.addEventListener("change", onViewportChange);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      media.removeEventListener("change", onViewportChange);
    };
  }, [refresh]);

  const collapsedValue = useMemo(() => {
    const remaining = pools
      .filter((pool) => pool.remaining !== null)
      .map((pool) => Number(pool.remaining));
    if (!remaining.length) return policy;
    return `${Math.min(...remaining).toLocaleString()}+`;
  }, [policy, pools]);

  if (!visible) return null;

  return (
    <aside className={`quickLimitDock ${collapsed ? "isCollapsed" : "isExpanded"}`} aria-label="OGENIC provider limits">
      <button
        type="button"
        className="quickLimitToggle"
        onClick={() => setCollapsed((current) => !current)}
        aria-expanded={!collapsed}
        aria-label={collapsed ? "Expand GM limit meter" : "Collapse GM limit meter"}
      >
        <span className="quickLimitToggleLabel">GM LIMIT</span>
        {collapsed && <span className="quickLimitCollapsedValue">{collapsedValue}</span>}
        <span className="quickLimitChevron" aria-hidden="true">{collapsed ? "▾" : "▴"}</span>
      </button>

      {!collapsed && (
        <>
          <div className="quickLimitTitle">
            <strong>PROVIDER POOLS</strong>
            <span>{policy}</span>
          </div>
          <div className="quickLimitPools">
            {pools.map((pool) => {
              const usedPercent = Math.max(0, Math.min(100, pool.percent ?? 0));
              return (
                <div className="quickLimitPool" key={pool.id} title={`${pool.used} used · ${pool.cap ?? "cap pending"}`}>
                  <div className="quickLimitMeta">
                    <strong>{pool.label}</strong>
                    <span>{pool.remaining ?? "—"} left</span>
                  </div>
                  <div className="quickLimitTrack" aria-label={`${pool.label} ${usedPercent.toFixed(1)}% used`}>
                    <i style={{ width: `${Math.max(2, usedPercent)}%` }} />
                  </div>
                  <small>{Math.round(usedPercent)}% used · {pool.state}</small>
                </div>
              );
            })}
          </div>
        </>
      )}
    </aside>
  );
}
