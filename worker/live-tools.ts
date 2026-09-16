export type LiveToolBindings = {
  GITHUB_TOKEN?: string;
  LINEAR_API_KEY?: string;
  N8N_API_KEY?: string;
  N8N_BASE_URL?: string;
  OGENIC_GITHUB_REPO?: string;
  OGENIC_GITHUB_BRANCH?: string;
  META_PAGE_ACCESS_TOKEN?: string;
  META_ACCESS_TOKEN?: string;
  META_IG_USER_ID?: string;
  INSTAGRAM_BUSINESS_ACCOUNT_ID?: string;
  INSTAGRAM_ACCESS_TOKEN?: string;
  IG_ACCESS_TOKEN?: string;
  WHATSAPP_ACCESS_TOKEN?: string;
  WHATSAPP_TOKEN?: string;
  META_WHATSAPP_ACCESS_TOKEN?: string;
  WHATSAPP_BUSINESS_ACCOUNT_ID?: string;
  WABA_ID?: string;
  WHATSAPP_PHONE_NUMBER_ID?: string;
  THREADS_ACCESS_TOKEN?: string;
  META_THREADS_ACCESS_TOKEN?: string;
};

export type LiveToolState = "LIVE" | "CONFIGURATION_REQUIRED" | "ERROR";

export type LiveToolSnapshot = {
  id: "github" | "linear" | "n8n" | "meta";
  label: string;
  state: LiveToolState;
  latency_ms: number;
  summary: string;
  checked_at: string;
  records: Array<Record<string, string | number | boolean | null>>;
};

function clean(value: unknown, max = 160) {
  return String(value ?? "").trim().slice(0, max);
}

async function requestJson(url: string, init: RequestInit) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("timeout"), 8_000);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const body = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) throw new Error(`HTTP_${response.status}`);
    return body;
  } finally {
    clearTimeout(timer);
  }
}

function configured(id: LiveToolSnapshot["id"], label: string, started: number): LiveToolSnapshot {
  return {
    id,
    label,
    state: "CONFIGURATION_REQUIRED",
    latency_ms: Date.now() - started,
    summary: "Waiting for a protected runtime binding",
    checked_at: new Date().toISOString(),
    records: [],
  };
}

function failed(id: LiveToolSnapshot["id"], label: string, error: unknown, started: number): LiveToolSnapshot {
  const raw = clean(error instanceof Error ? error.message : error, 80) || "Adapter request failed";
  const authFailure = raw === "HTTP_401" || raw === "HTTP_403";
  return {
    id,
    label,
    state: authFailure ? "CONFIGURATION_REQUIRED" : "ERROR",
    latency_ms: Date.now() - started,
    summary: authFailure ? `REAUTH_REQUIRED · ${label} Worker credential rejected (${raw.replace("HTTP_", "HTTP ")})` : raw,
    checked_at: new Date().toISOString(),
    records: [],
  };
}

async function github(env: LiveToolBindings): Promise<LiveToolSnapshot> {
  const started = Date.now();
  const token = clean(env.GITHUB_TOKEN, 500);
  const repository = clean(env.OGENIC_GITHUB_REPO, 180) || "Ogenicchocolate21debug/Build-Platform";
  const branch = clean(env.OGENIC_GITHUB_BRANCH, 180) || "phase-vi-provider-incentive-metering";
  if (!token) return configured("github", "GitHub", started);
  try {
    const result = await requestJson(
      `https://api.github.com/repos/${encodeURIComponent(repository.split("/")[0] ?? "")}/${encodeURIComponent(repository.split("/")[1] ?? "")}/actions/runs?branch=${encodeURIComponent(branch)}&per_page=5`,
      {
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "User-Agent": "ogenic-phase-vi-staging",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      },
    );
    const runs = Array.isArray(result.workflow_runs) ? result.workflow_runs as Array<Record<string, unknown>> : [];
    return {
      id: "github",
      label: "GitHub",
      state: "LIVE",
      latency_ms: Date.now() - started,
      summary: `${runs.length} recent CI runs on staging branch`,
      checked_at: new Date().toISOString(),
      records: runs.slice(0, 5).map((run) => ({
        id: clean(run.id, 80),
        name: clean(run.name),
        status: clean(run.status, 40),
        conclusion: clean(run.conclusion, 40) || null,
        url: clean(run.html_url, 300),
      })),
    };
  } catch (error) {
    return failed("github", "GitHub", error, started);
  }
}

async function linear(env: LiveToolBindings): Promise<LiveToolSnapshot> {
  const started = Date.now();
  const token = clean(env.LINEAR_API_KEY, 500);
  if (!token) return configured("linear", "Linear", started);
  try {
    const result = await requestJson("https://api.linear.app/graphql", {
      method: "POST",
      headers: { Authorization: token, "Content-Type": "application/json" },
      body: JSON.stringify({
        query: "query OgenicDashboard { viewer { id name } issues(first: 5, orderBy: updatedAt) { nodes { id identifier title url updatedAt state { name } } } }",
      }),
    });
    if (Array.isArray(result.errors) && result.errors.length) throw new Error("LINEAR_GRAPHQL_ERROR");
    const data = (result.data ?? {}) as Record<string, unknown>;
    const viewer = (data.viewer ?? {}) as Record<string, unknown>;
    const issueConnection = (data.issues ?? {}) as Record<string, unknown>;
    const issues = Array.isArray(issueConnection.nodes) ? issueConnection.nodes as Array<Record<string, unknown>> : [];
    return {
      id: "linear",
      label: "Linear",
      state: "LIVE",
      latency_ms: Date.now() - started,
      summary: `${issues.length} recent issues · ${clean(viewer.name, 80) || "owner"}`,
      checked_at: new Date().toISOString(),
      records: issues.map((issue) => ({
        id: clean(issue.id, 80),
        key: clean(issue.identifier, 40),
        title: clean(issue.title),
        status: clean((issue.state as Record<string, unknown> | undefined)?.name, 60),
        url: clean(issue.url, 300),
      })),
    };
  } catch (error) {
    return failed("linear", "Linear", error, started);
  }
}

async function n8n(env: LiveToolBindings): Promise<LiveToolSnapshot> {
  const started = Date.now();
  const token = clean(env.N8N_API_KEY, 500);
  const configuredUrl = clean(env.N8N_BASE_URL, 500).replace(/\/$/, "");
  if (!token || !configuredUrl) return configured("n8n", "n8n", started);
  try {
    const base = new URL(configuredUrl);
    if (base.protocol !== "https:") throw new Error("N8N_BASE_URL_REQUIRES_HTTPS");
    const result = await requestJson(`${base.origin}${base.pathname.replace(/\/$/, "")}/api/v1/workflows?limit=5`, {
      headers: { "X-N8N-API-KEY": token, Accept: "application/json" },
    });
    const workflows = Array.isArray(result.data) ? result.data as Array<Record<string, unknown>> : [];
    return {
      id: "n8n",
      label: "n8n",
      state: "LIVE",
      latency_ms: Date.now() - started,
      summary: `${workflows.length} workflows visible to the staging adapter`,
      checked_at: new Date().toISOString(),
      records: workflows.map((workflow) => ({
        id: clean(workflow.id, 80),
        name: clean(workflow.name),
        active: Boolean(workflow.active),
        updated_at: clean(workflow.updatedAt, 80) || null,
      })),
    };
  } catch (error) {
    return failed("n8n", "n8n", error, started);
  }
}

async function metaProbe(url: string, token: string) {
  if (!token) return { ready: false, state: "AUTH_REQUIRED" };
  try {
    await requestJson(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
    return { ready: true, state: "READY" };
  } catch (error) {
    const raw = clean(error instanceof Error ? error.message : error, 40);
    return { ready: false, state: raw === "HTTP_401" || raw === "HTTP_403" ? "REAUTH_REQUIRED" : raw || "ERROR" };
  }
}

async function meta(env: LiveToolBindings): Promise<LiveToolSnapshot> {
  const started = Date.now();
  const pageToken = clean(env.META_PAGE_ACCESS_TOKEN || env.META_ACCESS_TOKEN, 4000);
  const igToken = clean(env.INSTAGRAM_ACCESS_TOKEN || env.IG_ACCESS_TOKEN || pageToken, 4000);
  const igId = clean(env.INSTAGRAM_BUSINESS_ACCOUNT_ID || env.META_IG_USER_ID, 120);
  const waToken = clean(env.WHATSAPP_ACCESS_TOKEN || env.WHATSAPP_TOKEN || env.META_WHATSAPP_ACCESS_TOKEN, 4000);
  const waId = clean(env.WHATSAPP_BUSINESS_ACCOUNT_ID || env.WABA_ID || env.WHATSAPP_PHONE_NUMBER_ID, 120);
  const threadsToken = clean(env.THREADS_ACCESS_TOKEN || env.META_THREADS_ACCESS_TOKEN, 4000);

  if (!pageToken && !igToken && !waToken && !threadsToken) return configured("meta", "Meta Suite", started);

  const [facebook, instagram, whatsapp, threads] = await Promise.all([
    metaProbe("https://graph.facebook.com/me?fields=id,name", pageToken),
    igId ? metaProbe(`https://graph.facebook.com/${encodeURIComponent(igId)}?fields=id,username`, igToken) : Promise.resolve({ ready: false, state: igToken ? "ASSET_ID_REQUIRED" : "AUTH_REQUIRED" }),
    waId ? metaProbe(`https://graph.facebook.com/${encodeURIComponent(waId)}?fields=id`, waToken) : Promise.resolve({ ready: false, state: waToken ? "ASSET_ID_REQUIRED" : "AUTH_REQUIRED" }),
    metaProbe("https://graph.threads.net/v1.0/me?fields=id,username", threadsToken),
  ]);
  const records: LiveToolSnapshot["records"] = [
    { id: "facebook_messenger", label: "Facebook Page + Messenger", ready: facebook.ready, state: facebook.state },
    { id: "instagram", label: "Instagram Professional + Messaging", ready: instagram.ready, state: instagram.state },
    { id: "whatsapp", label: "WhatsApp Business", ready: whatsapp.ready, state: whatsapp.state },
    { id: "threads", label: "Threads", ready: threads.ready, state: threads.state },
    { id: "muse", label: "Muse Code", ready: true, state: "RUNTIME_READY_AUTH_SEPARATE" },
  ];
  const readyCount = records.filter((row) => row.ready === true).length;
  return {
    id: "meta",
    label: "Meta Suite",
    state: readyCount > 0 ? "LIVE" : "CONFIGURATION_REQUIRED",
    latency_ms: Date.now() - started,
    summary: `${readyCount}/5 Meta lanes runtime-ready · outbound actions approval-gated`,
    checked_at: new Date().toISOString(),
    records,
  };
}

export async function readLiveTools(env: LiveToolBindings) {
  return Promise.all([github(env), linear(env), n8n(env), meta(env)]);
}
