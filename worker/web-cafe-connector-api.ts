import { Hono } from "hono";
import { hasOwnerOrOpsAccess, type AuthBindings } from "./app-auth";

type Bindings = AuthBindings;
type Env = { Bindings: Bindings };

const noStore = { "Cache-Control": "no-store" };
const MAX_READ_BYTES = 140_000;
const MAX_RETURN_CHARS = 55_000;
const TIMEOUT_MS = 6_000;

const SOURCES = {
  candy_site: {
    id: "candy_site",
    label: "Candy Baked Factory website",
    url: "https://candybaked.ogenicchocolate.com/",
    kind: "html",
    canonical: false,
  },
  chocolate_site: {
    id: "chocolate_site",
    label: "OGENIC Chocolate website",
    url: "https://ogenicchocolate.com/",
    kind: "html",
    canonical: false,
  },
  deployment_readme: {
    id: "deployment_readme",
    label: "Public website source deployment notes",
    url: "https://raw.githubusercontent.com/Ogenicchocolate21debug/ogenic-chocolate/main/README_DEPLOY_TH.txt",
    kind: "text",
    canonical: false,
  },
  mobile_deployment_readme: {
    id: "mobile_deployment_readme",
    label: "Public mobile deployment notes",
    url: "https://raw.githubusercontent.com/Ogenicchocolate21debug/ogenic-chocolate/main/README_MOBILE_TH.txt",
    kind: "text",
    canonical: false,
  },
} as const;

type SourceId = keyof typeof SOURCES;

function scrubUrl(raw: string) {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function sourceUrls(html: string, base: string, tag: "href" | "src", max: number) {
  const values = new Set<string>();
  const escaped = tag === "href" ? "href" : "src";
  const regex = new RegExp(String.raw`<(?:a|area)[^>]*${escaped}=["']([^"']+)["']`, "gi");
  const srcRegex = new RegExp(String.raw`<(?:img|source|video|link)[^>]*${escaped}=["']([^"']+)["']`, "gi");
  const pattern = tag === "href" ? regex : srcRegex;
  for (const match of html.matchAll(pattern)) {
    const raw = match[1]?.trim() ?? "";
    if (!raw || raw.startsWith("#") || raw.startsWith("mailto:") || raw.startsWith("tel:") || raw.startsWith("javascript:") || raw.startsWith("data:")) continue;
    try {
      const safe = scrubUrl(new URL(raw, base).toString());
      if (safe) values.add(safe);
    } catch {
      // Ignore malformed references from untrusted page content.
    }
    if (values.size >= max) break;
  }
  return [...values];
}

function htmlToText(html: string) {
  return html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|iframe|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<(br|hr)\b[^>]*>/gi, "\n")
    .replace(/<\/(p|div|section|article|header|footer|main|nav|li|h[1-6]|tr|table)\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_RETURN_CHARS);
}

async function readBounded(response: Response) {
  if (!response.body) return { text: "", truncated: false };
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let truncated = false;
  try {
    while (total < MAX_READ_BYTES) {
      const next = await reader.read();
      if (next.done) break;
      const chunk = next.value;
      const take = Math.min(chunk.byteLength, MAX_READ_BYTES - total);
      chunks.push(chunk.slice(0, take));
      total += take;
      if (take < chunk.byteLength) {
        truncated = true;
        break;
      }
    }
    if (total >= MAX_READ_BYTES) truncated = true;
  } finally {
    if (truncated) await reader.cancel().catch(() => undefined);
    else reader.releaseLock();
  }
  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { text: new TextDecoder().decode(combined), truncated };
}

function allowedRedirectTarget(originalUrl: string, finalUrl: string) {
  try {
    const original = new URL(originalUrl);
    const final = new URL(finalUrl);
    if (final.protocol !== "https:" || final.username || final.password) return false;
    if (final.hostname === original.hostname) return true;
    const websiteSource = original.hostname === "ogenicchocolate.com" ||
      original.hostname.endsWith(".ogenicchocolate.com");
    if (websiteSource) {
      return final.hostname === "ogenicchocolate.com" ||
        final.hostname.endsWith(".ogenicchocolate.com") ||
        final.hostname === "ogenic-chocolate.pages.dev";
    }
    return false;
  } catch {
    return false;
  }
}

type SourceFetch = {
  response: Response;
  finalUrl: string;
  dispose: () => void;
};

async function requestSource(url: string, accept: string): Promise<SourceFetch> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const dispose = () => clearTimeout(timer);
  let currentUrl = url;

  try {
    // Keep the deadline active until the caller finishes consuming/cancelling
    // the response body, not just until the response headers arrive.
    for (let hop = 0; hop <= 5; hop += 1) {
      const response = await fetch(currentUrl, {
        method: "GET",
        headers: { Accept: accept, "User-Agent": "OGENIC-WAVE-WebCafe-ReadOnly-Connector/1.0" },
        redirect: "manual",
        cache: "no-store",
        signal: controller.signal,
      });

      const isRedirect = [301, 302, 303, 307, 308].includes(response.status);
      if (isRedirect) {
        const location = response.headers.get("location");
        if (response.body) await response.body.cancel().catch(() => undefined);
        if (!location) throw new Error("SOURCE_REDIRECT_LOCATION_MISSING");
        if (hop >= 5) throw new Error("SOURCE_REDIRECT_LIMIT_EXCEEDED");
        let nextUrl: URL;
        try {
          nextUrl = new URL(location, currentUrl);
        } catch {
          throw new Error("SOURCE_REDIRECT_LOCATION_INVALID");
        }
        if (!allowedRedirectTarget(url, nextUrl.toString())) throw new Error("SOURCE_REDIRECT_BLOCKED");
        currentUrl = nextUrl.toString();
        continue;
      }

      const finalUrl = scrubUrl(currentUrl);
      if (!finalUrl || !allowedRedirectTarget(url, finalUrl)) {
        if (response.body) await response.body.cancel().catch(() => undefined);
        throw new Error("SOURCE_REDIRECT_BLOCKED");
      }
      return { response, finalUrl, dispose };
    }
    throw new Error("SOURCE_REDIRECT_LIMIT_EXCEEDED");
  } catch (error) {
    dispose();
    throw error;
  }
}

async function probeSource(source: (typeof SOURCES)[SourceId]) {
  let dispose: (() => void) | undefined;
  try {
    const result = await requestSource(
      source.url,
      source.kind === "html" ? "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1" : "text/plain,*/*;q=0.1",
    );
    dispose = result.dispose;
    const { response, finalUrl } = result;
    if (response.body) await response.body.cancel().catch(() => undefined);
    return {
      id: source.id,
      label: source.label,
      url: source.url,
      state: response.ok ? "LIVE" : "DEGRADED",
      http_status: response.status,
      content_type: response.headers.get("content-type")?.split(";")[0] ?? null,
      final_url: finalUrl,
      canonical: source.canonical,
      checked_at: new Date().toISOString(),
    };
  } catch {
    return {
      id: source.id,
      label: source.label,
      url: source.url,
      state: "OFFLINE",
      http_status: null,
      content_type: null,
      final_url: null,
      canonical: source.canonical,
      code: "SOURCE_UNREACHABLE",
      checked_at: new Date().toISOString(),
    };
  } finally {
    dispose?.();
  }
}

async function probeGithubRepo() {
  const url = "https://api.github.com/repos/Ogenicchocolate21debug/ogenic-chocolate";
  let dispose: (() => void) | undefined;
  try {
    const result = await requestSource(url, "application/vnd.github+json");
    dispose = result.dispose;
    const { response } = result;
    let payload: Record<string, unknown> | null = null;
    if (response.ok) {
      const bounded = await readBounded(response);
      try {
        payload = JSON.parse(bounded.text) as Record<string, unknown>;
      } catch {
        payload = null;
      }
    } else if (response.body) {
      await response.body.cancel().catch(() => undefined);
    }
    if (!response.ok || !payload) {
      return {
        id: "candybaked_source_repo",
        url: "https://github.com/Ogenicchocolate21debug/ogenic-chocolate",
        state: "DEGRADED",
        http_status: response.status,
        code: "REPOSITORY_METADATA_UNAVAILABLE",
        checked_at: new Date().toISOString(),
      };
    }
    return {
      id: "candybaked_source_repo",
      url: "https://github.com/Ogenicchocolate21debug/ogenic-chocolate",
      state: payload.private === false ? "LIVE" : "DEGRADED",
      http_status: response.status,
      private: Boolean(payload.private),
      default_branch: typeof payload.default_branch === "string" ? payload.default_branch : null,
      updated_at: typeof payload.updated_at === "string" ? payload.updated_at : null,
      html_url: typeof payload.html_url === "string" ? payload.html_url : null,
      canonical_for_product_data: false,
      role: "public_source_mirror_and_deployment_notes",
      checked_at: new Date().toISOString(),
    };
  } catch {
    return {
      id: "candybaked_source_repo",
      url: "https://github.com/Ogenicchocolate21debug/ogenic-chocolate",
      state: "OFFLINE",
      code: "REPOSITORY_API_UNREACHABLE",
      checked_at: new Date().toISOString(),
    };
  } finally {
    dispose?.();
  }
}

export function createWebCafeConnectorApi() {
  const api = new Hono<Env>();

  api.use("/api/web-cafe/*", async (c, next) => {
    if (!(await hasOwnerOrOpsAccess(c.req.raw, c.env))) {
      return c.json({ ok: false, code: "REAUTH_REQUIRED", role: "owner" }, 401, noStore);
    }
    await next();
  });

  api.get("/api/web-cafe/status", async (c) => {
    const ids = Object.keys(SOURCES) as SourceId[];
    const [sourceStates, repo] = await Promise.all([
      Promise.all(ids.map((id) => probeSource(SOURCES[id]))),
      probeGithubRepo(),
    ]);
    return c.json({
      ok: true,
      runtime: "WEB_CAFE_READONLY_CONNECTOR_V1",
      mode: "READ_ONLY",
      writes_enabled: false,
      deployment_enabled: false,
      sources: [...sourceStates, repo],
      authority: {
        primary_runtime: "cloudflare_pages",
        canonical_product_media_and_A1_A6_data: "Google Drive + canonical Google Docs",
        github_role: "public source mirror / deployment notes",
        vercel_role: "secondary preview and deployment inspection only",
        live_vercel_api_probe: "NOT_PERFORMED_BY_THIS_WORKER",
        drive_api_probe: "NOT_PERFORMED_BY_THIS_WORKER",
      },
      scope: {
        arbitrary_url_fetch: false,
        request_credentials_forwarded: false,
        page_scripts_executed: false,
        raw_secrets_returned: false,
      },
    }, 200, noStore);
  });

  api.get("/api/web-cafe/read", async (c) => {
    const sourceId = c.req.query("source") as SourceId | undefined;
    if (!sourceId || !Object.hasOwn(SOURCES, sourceId)) {
      return c.json({ ok: false, code: "SOURCE_NOT_ALLOWED", allowed_sources: Object.keys(SOURCES) }, 400, noStore);
    }
    const source = SOURCES[sourceId];
    let dispose: (() => void) | undefined;
    try {
      const result = await requestSource(
        source.url,
        source.kind === "html" ? "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1" : "text/plain,*/*;q=0.1",
      );
      dispose = result.dispose;
      const { response, finalUrl } = result;
      if (!response.ok) {
        if (response.body) await response.body.cancel().catch(() => undefined);
        return c.json({ ok: false, code: "SOURCE_HTTP_ERROR", source: source.id, http_status: response.status }, 502, noStore);
      }
      const bounded = await readBounded(response);
      const isHtml = (response.headers.get("content-type") ?? "").toLowerCase().includes("html") || source.kind === "html";
      const text = isHtml ? htmlToText(bounded.text) : bounded.text.slice(0, MAX_RETURN_CHARS);
      return c.json({
        ok: true,
        runtime: "WEB_CAFE_READONLY_CONNECTOR_V1",
        source: source.id,
        label: source.label,
        source_url: source.url,
        final_url: finalUrl,
        fetched_at: new Date().toISOString(),
        content_type: response.headers.get("content-type")?.split(";")[0] ?? null,
        truncated: bounded.truncated || bounded.text.length > MAX_RETURN_CHARS,
        text,
        links: isHtml ? sourceUrls(bounded.text, finalUrl, "href", 100) : [],
        images: isHtml ? sourceUrls(bounded.text, finalUrl, "src", 100) : [],
        canonical_product_data: false,
        content_is_untrusted_input: true,
        writes_enabled: false,
        deployment_enabled: false,
      }, 200, noStore);
    } catch {
      return c.json({ ok: false, code: "SOURCE_UNREACHABLE", source: source.id }, 502, noStore);
    } finally {
      dispose?.();
    }
  });

  return api;
}
