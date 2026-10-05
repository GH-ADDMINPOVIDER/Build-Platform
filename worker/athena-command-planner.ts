export type AthenaCommandPlanStatus = "READY" | "AMBIGUOUS" | "UNSUPPORTED" | "BLOCKED";

export type AthenaCommandPlan = {
  plan_version: "ATHENA_COMMAND_PLAN_V1";
  planner: "DETERMINISTIC_NL_V1";
  status: AthenaCommandPlanStatus;
  normalized_intent: string;
  capability?: string;
  provider?: string;
  environment: "staging";
  input?: { path?: string };
  reason?: string;
  requires_yellow_stone: true;
  approval_authority: "YELLOW_STONE";
  direct_execution_bypass: false;
};

const SECRET_INTENT = /(?:password|passwd|secret|token|api[_ -]?key|private[_ -]?key|credential|cookie|session[_ -]?key|รหัสผ่าน|โทเคน|ซีเคร็ต)/i;
const URL_LIKE = /https?:\/\//i;
const SENSITIVE_PATH = /(^|\/)(?:\.env(?:\.|$)|credentials?(?:\.|$)|secrets?(?:\.|$)|id_rsa(?:\.|$)|[^/]+\.(?:pem|p12|pfx|key)$)/i;
const READ_WORDS = /(?:\bread\b|\bopen\b|\bshow\b|\bview\b|\binspect\b|\bcheck\b|\blook\s+at\b|อ่าน|เปิด|ดู|เช็ก|เช็ค|ตรวจ)/i;
const DEPLOY_WORD = /(?:\bdeploy\b|\brelease\b|ดีพลอย|ปล่อยขึ้น)/i;
const PROMOTE_WORD = /(?:\bpromote\b|\bproduction\b|\bprod\b|โปรดักชัน|ขึ้นโปรด)/i;
const PREVIEW_WORD = /(?:\bpreview\b|\bstaging\b|พรีวิว|สเตจจิง)/i;
const RUNTIME_WORD = /(?:\bruntime\b|\bhealth\b|\bstatus\b|สถานะ|รันไทม์)/i;
const VERIFY_WORD = /(?:\bverify\b|\bcheck\b|\binspect\b|ตรวจ|เช็ก|เช็ค)/i;
const WORKFLOW_WORD = /(?:\bworkflow\b|\brun\b|เวิร์กโฟลว์|รัน)/i;
const DRIVE_SCAN_WORD = /(?:\bdrive\b|google\s+drive|ไดรฟ์)/i;
const SCAN_WORD = /(?:\bscan\b|\blist\b|\bfind\b|สแกน|ค้น|หา)/i;

const compact = (value: unknown, max: number) => String(value ?? "").trim().replace(/\s+/g, " ").slice(0, max);

function basePlan(intent: string): Pick<AthenaCommandPlan,
  "plan_version" | "planner" | "normalized_intent" | "environment" | "requires_yellow_stone" | "approval_authority" | "direct_execution_bypass"
> {
  return {
    plan_version: "ATHENA_COMMAND_PLAN_V1",
    planner: "DETERMINISTIC_NL_V1",
    normalized_intent: intent,
    environment: "staging",
    requires_yellow_stone: true,
    approval_authority: "YELLOW_STONE",
    direct_execution_bypass: false,
  };
}

function normalizePath(value: string) {
  return value
    .trim()
    .replace(/^[`'"(\[]+|[`'"),.!?\]]+$/g, "")
    .replace(/^\.\//, "")
    .replace(/^\/+/, "");
}

function candidatePaths(intent: string) {
  const found = new Set<string>();
  const add = (raw: string) => {
    const path = normalizePath(raw);
    if (!path || path.length > 500) return;
    if (URL_LIKE.test(path) || path.includes("..") || path.includes("\\") || path.includes(":")) return;
    if (SENSITIVE_PATH.test(path)) return;
    if (!path.includes("/") && !/\.[a-z0-9]{1,8}$/i.test(path)) return;
    found.add(path);
  };

  for (const match of intent.matchAll(/`([^`]+)`|"([^"]+)"|'([^']+)'/g)) {
    add(match[1] || match[2] || match[3] || "");
  }
  for (const match of intent.matchAll(/(?:^|\s)([A-Za-z0-9_.@-]+(?:\/[A-Za-z0-9_.@-]+)+|[A-Za-z0-9_.@-]+\.[A-Za-z0-9]{1,8})(?=$|\s|[,.!?])/g)) {
    add(match[1] || "");
  }
  return [...found];
}

export function planAthenaCommand(rawIntent: unknown): AthenaCommandPlan {
  const intent = compact(rawIntent, 1200);
  const base = basePlan(intent);
  if (!intent) {
    return { ...base, status: "UNSUPPORTED", reason: "INTENT_REQUIRED" };
  }
  if (URL_LIKE.test(intent)) {
    return { ...base, status: "BLOCKED", reason: "ARBITRARY_URL_NOT_ALLOWED" };
  }
  if (SECRET_INTENT.test(intent)) {
    return { ...base, status: "BLOCKED", reason: "SECRET_OR_CREDENTIAL_INTENT_NOT_ALLOWED" };
  }

  const paths = candidatePaths(intent);
  if (paths.length > 1) {
    return { ...base, status: "AMBIGUOUS", reason: "MULTIPLE_RESOURCE_PATHS" };
  }
  if (paths.length === 1 && READ_WORDS.test(intent)) {
    return {
      ...base,
      status: "READY",
      capability: "read_file",
      provider: "github",
      input: { path: paths[0] },
    };
  }

  if (DEPLOY_WORD.test(intent) && PROMOTE_WORD.test(intent)) {
    return {
      ...base,
      status: "READY",
      capability: "deploy_promote",
      provider: "cloudflare",
    };
  }
  if (DEPLOY_WORD.test(intent) && PREVIEW_WORD.test(intent)) {
    return {
      ...base,
      status: "READY",
      capability: "deploy_preview",
      provider: "cloudflare",
    };
  }
  if (DEPLOY_WORD.test(intent)) {
    return { ...base, status: "AMBIGUOUS", reason: "DEPLOY_TARGET_REQUIRED_PREVIEW_OR_PROMOTE" };
  }

  if (RUNTIME_WORD.test(intent) && VERIFY_WORD.test(intent)) {
    return {
      ...base,
      status: "READY",
      capability: "runtime_verify",
      provider: "cloudflare",
    };
  }

  if (/\bn8n\b/i.test(intent) && WORKFLOW_WORD.test(intent)) {
    return {
      ...base,
      status: "READY",
      capability: "workflow_run",
      provider: "n8n",
    };
  }

  if (DRIVE_SCAN_WORD.test(intent) && SCAN_WORD.test(intent)) {
    return {
      ...base,
      status: "READY",
      capability: "drive_scan",
      provider: "google_drive",
    };
  }

  if (READ_WORDS.test(intent) && paths.length === 0) {
    return { ...base, status: "AMBIGUOUS", reason: "RESOURCE_PATH_REQUIRED_FOR_VERIFIED_READ" };
  }

  return { ...base, status: "UNSUPPORTED", reason: "NO_BOUNDED_CAPABILITY_MATCH" };
}
