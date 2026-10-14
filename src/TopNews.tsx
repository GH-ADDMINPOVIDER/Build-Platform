import { useCallback, useEffect, useMemo, useState } from "react";

type NewsCategory = "WORLD" | "TECH";
type Filter = "ALL" | NewsCategory;
type FeedItem = {
  id: string; category: NewsCategory; publisher: string; title: string;
  summary: string; url: string; published_at: string | null;
};
type FeedSource = {
  id: string; label: string; publisher: string; category: NewsCategory;
  state: "LIVE" | "DEGRADED"; item_count: number; checked_at: string;
};
type NewsResponse = {
  ok: boolean; mode?: string; generated_at?: string; sources?: FeedSource[];
  items?: FeedItem[]; code?: string;
};

function displayTime(value: string | null | undefined) {
  if (!value) return "Publication time not provided";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Publication time not provided"
    : date.toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });
}

export default function TopNews() {
  const [payload, setPayload] = useState<NewsResponse | null>(null);
  const [filter, setFilter] = useState<Filter>("ALL");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/top-news", {
        method: "GET", credentials: "same-origin", cache: "no-store",
        headers: { Accept: "application/json" },
      });
      const body = await response.json().catch(() => ({})) as NewsResponse;
      if (!response.ok || !body.ok) {
        if (response.status === 401) throw new Error("OWNER_SESSION_REQUIRED");
        throw new Error(body.code || "TOP_NEWS_UNAVAILABLE");
      }
      setPayload(body);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "TOP_NEWS_UNAVAILABLE");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const items = useMemo(() => {
    const sourceItems = payload?.items ?? [];
    return filter === "ALL" ? sourceItems : sourceItems.filter((item) => item.category === filter);
  }, [payload, filter]);

  const liveCount = (payload?.sources ?? []).filter((source) => source.state === "LIVE").length;
  const totalSources = payload?.sources?.length ?? 2;

  return (
    <main className="topNewsShell">
      <header className="topNewsHeader">
        <a className="topNewsBrand" href="/" aria-label="WAVE home">
          <span className="topNewsMark">W</span>
          <span><b>WAVE</b><small>OWNER WORKSPACE</small></span>
        </a>
        <nav className="topNewsNav" aria-label="WAVE navigation">
          <a href="/">Web</a><a href="/chat">Chat</a><a href="/command">Command</a><a href="/overview">Operate</a>
        </nav>
      </header>

      <section className="topNewsHero">
        <div className="topNewsHeroCopy">
          <span className="topNewsEyebrow">WORLD · TECHNOLOGY · LIVE RSS</span>
          <h1>Top News<span>.</span></h1>
          <p>ข่าวล่าสุดจากแหล่ง RSS ที่กำหนดไว้ โดยแสดงหัวข้อและที่มาโดยตรง ไม่เรียก AI หรือใช้โควตาในการดึงข่าว</p>
          <div className="topNewsMetaRow">
            <span className={liveCount === totalSources ? "topNewsSignal isLive" : "topNewsSignal"}><i /> {liveCount}/{totalSources} sources live</span>
            <span>Read-only · Owner session</span>
            {payload?.generated_at && <span>Updated {displayTime(payload.generated_at)}</span>}
          </div>
        </div>
        <button className="topNewsRefresh" onClick={() => void refresh(true)} disabled={refreshing}>
          <span aria-hidden="true">{refreshing ? "…" : "↻"}</span>{refreshing ? "Refreshing" : "Refresh"}
        </button>
      </section>

      <section className="topNewsSourceGrid" aria-label="News source status">
        {(payload?.sources ?? []).map((source) => (
          <article className="topNewsSource" key={source.id}>
            <div className="topNewsSourceTop">
              <span className="topNewsSourceCategory">{source.category === "WORLD" ? "WORLD" : "TECHNOLOGY"}</span>
              <span className={source.state === "LIVE" ? "topNewsState isLive" : "topNewsState isDegraded"}>{source.state}</span>
            </div>
            <h2>{source.publisher}</h2><p>{source.label}</p>
            <small>{source.item_count} headlines · checked {displayTime(source.checked_at)}</small>
          </article>
        ))}
      </section>

      <section className="topNewsFeed" aria-label="Latest headlines">
        <div className="topNewsFeedHead">
          <div><span className="topNewsEyebrow">SOURCE-LINKED HEADLINES</span><h2>Latest stories</h2></div>
          <div className="topNewsFilters" role="group" aria-label="Filter news categories">
            {([["ALL", "All"], ["WORLD", "World"], ["TECH", "Technology"]] as Array<[Filter, string]>).map(([value, label]) => (
              <button key={value} className={filter === value ? "isActive" : ""}
                onClick={() => setFilter(value)} aria-pressed={filter === value}>{label}</button>
            ))}
          </div>
        </div>

        {loading && <div className="topNewsEmpty" role="status">Loading live headlines…</div>}
        {!loading && error === "OWNER_SESSION_REQUIRED" && (
          <div className="topNewsNotice" role="alert">
            <strong>Owner session required</strong><p>เปิด Operate แล้วเข้าสู่ระบบก่อนอ่านข่าวใน WAVE</p>
            <a href="/overview">Open Operate ↗</a>
          </div>
        )}
        {!loading && error && error !== "OWNER_SESSION_REQUIRED" && (
          <div className="topNewsNotice" role="alert">
            <strong>News feed unavailable</strong>
            <p>{error}. ลอง Refresh อีกครั้งได้ โดยระบบจะไม่เรียก AI หรือ retry อัตโนมัติ</p>
            <button onClick={() => void refresh(true)} disabled={refreshing}>Try again</button>
          </div>
        )}
        {!loading && !error && items.length === 0 && <div className="topNewsEmpty">No headlines returned for this filter.</div>}
        {!loading && !error && items.length > 0 && (
          <div className="topNewsCards">
            {items.map((item, index) => (
              <article className="topNewsStory" key={item.id}>
                <div className="topNewsStoryIndex">{String(index + 1).padStart(2, "0")}</div>
                <div className="topNewsStoryBody">
                  <div className="topNewsStoryMeta">
                    <span>{item.publisher}</span><span>{item.category === "WORLD" ? "WORLD" : "TECH"}</span>
                    <time>{displayTime(item.published_at)}</time>
                  </div>
                  <h3><a href={item.url} target="_blank" rel="noreferrer">{item.title}</a></h3>
                  {item.summary && <p>{item.summary}</p>}
                  <a className="topNewsReadLink" href={item.url} target="_blank" rel="noreferrer">Read at source ↗</a>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
      <footer className="topNewsFooter"><span>WAVE · TOP NEWS</span><span>BBC World RSS · The Verge RSS</span><span>AI summary: NOT RUN · writes: disabled</span></footer>
    </main>
  );
}
