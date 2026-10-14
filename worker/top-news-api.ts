import { Hono } from "hono";
import { hasOwnerOrOpsAccess, type AuthBindings } from "./app-auth";

type Env = { Bindings: AuthBindings };
type NewsCategory = "WORLD" | "TECH";
type NewsSource = {
  id: string;
  label: string;
  publisher: string;
  category: NewsCategory;
  feed_url: string;
  allowed_hosts: readonly string[];
};
type NewsItem = {
  id: string;
  category: NewsCategory;
  publisher: string;
  title: string;
  summary: string;
  url: string;
  published_at: string | null;
};

const NO_STORE = { "Cache-Control": "no-store" };
const FETCH_TIMEOUT_MS = 6_000;
const MAX_FEED_BYTES = 220_000;
const MAX_ITEMS_PER_SOURCE = 8;

const SOURCES: readonly NewsSource[] = [
  {
    id: "world", label: "Latest world headlines", publisher: "BBC News", category: "WORLD",
    feed_url: "https://feeds.bbci.co.uk/news/world/rss.xml",
    allowed_hosts: ["feeds.bbci.co.uk", "bbc.co.uk", "www.bbc.co.uk", "bbc.com", "www.bbc.com"],
  },
  {
    id: "technology", label: "Latest technology headlines", publisher: "The Verge", category: "TECH",
    feed_url: "https://www.theverge.com/rss/index.xml",
    allowed_hosts: ["theverge.com", "www.theverge.com"],
  },
];

function decodedText(raw: string, max: number) {
  return raw
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, "$1")
    .replace(/<(script|style|iframe|svg)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex: string) => {
      const value = Number.parseInt(hex, 16);
      return value > 0 && value <= 0x10ffff ? String.fromCodePoint(value) : " ";
    })
    .replace(/&#(\d+);/g, (_match, decimal: string) => {
      const value = Number.parseInt(decimal, 10);
      return value > 0 && value <= 0x10ffff ? String.fromCodePoint(value) : " ";
    })
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&")
    .replace(/[\u0000-\u001f\s]+/g, " ")
    .trim()
    .slice(0, max);
}

function xmlTag(block: string, tag: string) {
  const pattern = "<" + tag + "\\b[^>]*>([\\s\\S]*?)<\\/" + tag + "\\s*>";
  const match = new RegExp(pattern, "i").exec(block);
  return match?.[1] ?? "";
}

function safeArticleUrl(raw: string, source: NewsSource) {
  try {
    const url = new URL(decodedText(raw, 200));
    if (url.protocol !== "https:" || url.username || url.password) return null;
    if (!source.allowed_hosts.includes(url.hostname.toLowerCase())) return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function parseFeed(xml: string, source: NewsSource): NewsItem[] {
  const items: NewsItem[] = [];
  const expression = /<item\b[^>]*>([\s\S]*?)<\/item\s*>/gi;
  for (const match of xml.matchAll(expression)) {
    const block = match[1] ?? "";
    const title = decodedText(xmlTag(block, "title"), 300);
    const url = safeArticleUrl(xmlTag(block, "link"), source);
    if (!title || !url) continue;
    const published = decodedText(xmlTag(block, "pubDate") || xmlTag(block, "published") || xmlTag(block, "updated"), 100);
    const date = published ? new Date(published) : null;
    items.push({
      id: source.id + ":" + (items.length + 1) + ":" + title.slice(0, 64),
      category: source.category,
      publisher: source.publisher,
      title,
      summary: decodedText(xmlTag(block, "description") || xmlTag(block, "summary"), 360),
      url,
      published_at: date && !Number.isNaN(date.getTime()) ? date.toISOString() : null,
    });
    if (items.length >= MAX_ITEMS_PER_SOURCE) break;
  }
  return items;
}

async function readLimited(response: Response) {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let overLimit = false;
  try {
    while (total < MAX_FEED_BYTES) {
      const part = await reader.read();
      if (part.done) break;
      const chunk = part.value;
      const take = Math.min(chunk.byteLength, MAX_FEED_BYTES - total);
      chunks.push(chunk.slice(0, take));
      total += take;
      if (take < chunk.byteLength) { overLimit = true; break; }
    }
  } finally {
    if (overLimit || total >= MAX_FEED_BYTES) await reader.cancel().catch(() => undefined);
    else reader.releaseLock();
  }
  if (overLimit || total >= MAX_FEED_BYTES) throw new Error("FEED_TOO_LARGE");
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(bytes);
}

async function fetchFeed(source: NewsSource) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let current = new URL(source.feed_url);
  try {
    for (let hop = 0; hop <= 3; hop += 1) {
      if (current.protocol !== "https:" || !source.allowed_hosts.includes(current.hostname.toLowerCase())) {
        throw new Error("FEED_HOST_BLOCKED");
      }
      const response = await fetch(current.toString(), {
        method: "GET",
        headers: { Accept: "application/rss+xml, application/xml;q=0.9, text/xml;q=0.8" },
        redirect: "manual",
        cache: "no-store",
        signal: controller.signal,
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        if (response.body) await response.body.cancel().catch(() => undefined);
        if (!location || hop === 3) throw new Error("FEED_REDIRECT_LIMIT");
        let next: URL;
        try { next = new URL(location, current); } catch { throw new Error("FEED_REDIRECT_INVALID"); }
        if (next.protocol !== "https:" || !source.allowed_hosts.includes(next.hostname.toLowerCase())) {
          throw new Error("FEED_REDIRECT_BLOCKED");
        }
        current = next;
        continue;
      }
      if (!response.ok) {
        if (response.body) await response.body.cancel().catch(() => undefined);
        throw new Error("FEED_HTTP_ERROR");
      }
      const contentLength = Number(response.headers.get("content-length") || "0");
      if (contentLength > MAX_FEED_BYTES) {
        if (response.body) await response.body.cancel().catch(() => undefined);
        throw new Error("FEED_TOO_LARGE");
      }
      const xml = await readLimited(response);
      return parseFeed(xml, source);
    }
    throw new Error("FEED_REDIRECT_LIMIT");
  } finally {
    clearTimeout(timer);
  }
}

export function createTopNewsApi() {
  const api = new Hono<Env>();
  api.use("/api/top-news", async (c, next) => {
    if (!(await hasOwnerOrOpsAccess(c.req.raw, c.env))) {
      return c.json({ ok: false, code: "REAUTH_REQUIRED", role: "owner" }, 401, NO_STORE);
    }
    await next();
  });

  api.get("/api/top-news", async (c) => {
    const results = await Promise.all(SOURCES.map(async (source) => {
      try {
        const items = await fetchFeed(source);
        return {
          source: { id: source.id, label: source.label, publisher: source.publisher, category: source.category,
            state: "LIVE" as const, item_count: items.length, checked_at: new Date().toISOString() },
          items,
        };
      } catch {
        return {
          source: { id: source.id, label: source.label, publisher: source.publisher, category: source.category,
            state: "DEGRADED" as const, item_count: 0, checked_at: new Date().toISOString() },
          items: [] as NewsItem[],
        };
      }
    }));
    const items = results.flatMap((result) => result.items);
    const sources = results.map((result) => result.source);
    const generatedAt = new Date().toISOString();
    if (items.length === 0) {
      return c.json({ ok: false, code: "ALL_NEWS_SOURCES_UNAVAILABLE", mode: "LIVE_RSS_READ_ONLY",
        generated_at: generatedAt, sources, items: [], ai_summary: "NOT_RUN", writes_enabled: false },
      502, NO_STORE);
    }
    return c.json({ ok: true, mode: "LIVE_RSS_READ_ONLY", generated_at: generatedAt, sources, items,
      ai_summary: "NOT_RUN", writes_enabled: false, deployment_enabled: false }, 200, NO_STORE);
  });
  return api;
}
