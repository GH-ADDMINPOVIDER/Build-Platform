import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");

test("Top News is a real separately routed WAVE HTML surface and linked from the landing navigation", async () => {
  const main = await read("src/main.tsx");
  const landing = await read("src/Landing.tsx");
  const page = await read("src/TopNews.tsx");
  const css = await read("src/top-news.css");
  assert.ok(main.includes('pathname === "/news"'));
  assert.ok(main.includes("<TopNews />"));
  assert.ok(main.includes('import TopNews from "./TopNews"'));
  assert.ok(landing.includes('href="/news">TOP NEWS</a>'));
  assert.ok(page.includes("<h1>Top News"));
  assert.ok(page.includes("Latest stories"));
  assert.ok(page.includes('aria-label="Filter news categories"'));
  assert.ok(css.includes("@media(max-width:700px)"));
});

test("the Worker exposes only owner/ops read-only RSS sources with bounded HTTPS redirects", async () => {
  const api = await read("worker/top-news-api.ts");
  const entry = await read("worker/entry-yellow-stone.ts");
  assert.ok(entry.includes("createTopNewsApi"));
  assert.ok(entry.includes('pathname === "/api/top-news"'));
  assert.ok(api.includes("hasOwnerOrOpsAccess(c.req.raw, c.env)"));
  assert.ok(api.includes("https://feeds.bbci.co.uk/news/world/rss.xml"));
  assert.ok(api.includes("https://www.theverge.com/rss/index.xml"));
  assert.ok(api.includes('redirect: "manual"'));
  assert.ok(api.includes("FEED_REDIRECT_BLOCKED"));
  assert.ok(api.includes("MAX_FEED_BYTES = 220_000"));
  assert.ok(api.includes("FETCH_TIMEOUT_MS = 6_000"));
  assert.ok(!api.includes('c.req.query("url")'));
  assert.ok(!/api\.(post|put|patch|delete)\(/i.test(api));
});

test("Top News never calls a paid model or activates the isolated Gmail/n8n demo", async () => {
  const api = await read("worker/top-news-api.ts");
  const page = await read("src/TopNews.tsx");
  const spec = await read("docs/research/TOP_NEWS_P_SPEC.md");
  assert.ok(api.includes('ai_summary: "NOT_RUN"'));
  assert.ok(api.includes("writes_enabled: false"));
  assert.ok(api.includes("deployment_enabled: false"));
  assert.ok(!/OPENAI_API_KEY|codex exec|n8n\.io|gmail/i.test(api));
  assert.ok(page.includes("AI summary: NOT RUN"));
  assert.ok(spec.includes("No hidden model invocation"));
});

test("feed output is sanitized and source-linked; owner session failures remain explicit", async () => {
  const api = await read("worker/top-news-api.ts");
  const page = await read("src/TopNews.tsx");
  assert.ok(api.includes("decodedText"));
  assert.ok(api.includes("safeArticleUrl"));
  assert.ok(api.includes("ALL_NEWS_SOURCES_UNAVAILABLE"));
  assert.ok(page.includes("OWNER_SESSION_REQUIRED"));
  assert.ok(page.includes('target="_blank" rel="noreferrer"'));
  assert.ok(page.includes("No headlines returned for this filter."));
});

test("OGE-125 connector proof does not dispatch on unrelated shared Worker entry changes alone", async () => {
  const workflow = await read(".github/workflows/oge-125-web-cafe-connector-proof.yml");
  const pathBlock = workflow.split("paths:")[1]?.split("jobs:")[0] ?? "";
  assert.ok(pathBlock.includes('worker/web-cafe-connector-api.ts'));
  assert.ok(!pathBlock.includes('worker/entry-yellow-stone.ts'));
  assert.ok(!pathBlock.includes('.github/workflows/oge-125-web-cafe-connector-proof.yml'));
});
