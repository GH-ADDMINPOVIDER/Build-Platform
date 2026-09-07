import { useCallback, useEffect, useState } from "react";

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
      // Keep the last known snapshot; this dock is telemetry-only.
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 30_000);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);

  if (!visible) return null;

  return (
    <aside className="quickLimitDock" aria-label="OGENIC provider limits">
      <div className="quickLimitTitle">
        <strong>GM LIMIT</strong>
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
    </aside>
  );
}
