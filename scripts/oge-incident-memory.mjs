#!/usr/bin/env node
// One reusable bug notebook for all OGE issues; no new service, table or paid LLM.
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const source = resolve("config/oge-error-memory.json");
const db = JSON.parse(readFileSync(source, "utf8"));
const args = process.argv.slice(2);
const action = args[0] || "lookup";
const opt = {};
for (let i = 1; i < args.length; i += 2) {
  if (!args[i]?.startsWith("--") || args[i + 1] === undefined) throw new Error("EXPECTED_NAMED_OPTIONS");
  opt[args[i].slice(2)] = args[i + 1];
}
const issue = String(opt.oge || opt.issue || "").trim().toUpperCase().replace(/^OGE\s*[-#:]?\s*(\d+)$/i,"OGE-$1");
const code = String(opt.code || "").trim().toLowerCase();
const component = String(opt.component || "").trim().toLowerCase();
const http = opt.http && /^\d{3}$/.test(opt.http) ? Number(opt.http) : null;
if (opt.http && (http === null || http < 100 || http > 599)) throw new Error("INVALID_HTTP_STATUS_USE_--code_FOR_APPLICATION_ERROR");
const safeText = (v,max=160) => String(v ?? "").replace(/[\r\n]/g, " ").trim().slice(0,max);
const hint = db.http_hints.find(x => x.http_status === http) ?? null;
const incidents = db.incidents.filter(x =>
  (!issue || x.issues.includes(issue)) &&
  (http === null || x.http_status === http) &&
  (!code || !x.error_code || x.error_code.toLowerCase() === code) &&
  (!component || x.component.toLowerCase().includes(component))
);
function show(x) { console.log(JSON.stringify(x,null,2)); }
if (action === "lookup") {
  const identity = Boolean(issue || code || component);
  const entry = identity ? incidents[0] ?? null : null;
  show({matched:Boolean(entry),issue:issue||null,incident:entry,http_hint:hint,
    next_action:entry?.next_action || (identity ? "RECORD_ON_EXISTING_OGE_WITH_EVIDENCE":"PROVIDE_OGE_AND_ERROR_CODE_OR_COMPONENT"),
    advisory_only:true});
} else if (action === "record") {
  if (!/^OGE-\d+$/.test(issue) || !component || !((http !== null && http >= 100 && http <= 599) || code)) {
    throw new Error("RECORD_REQUIRES_OGE_COMPONENT_AND_HTTP_OR_CODE");
  }
  const evidence = String(opt.evidence || "");
  if (!/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/actions\/runs\/\d+$/.test(evidence)) {
    throw new Error("RECORD_REQUIRES_GITHUB_ACTIONS_EVIDENCE_URL");
  }
  if (/(?:sk-[a-z0-9_-]{12,}|gh[pousr]_[a-z0-9]{12,}|bearer\s+[a-z0-9._~+/=-]{12,})/i.test(JSON.stringify(opt))) {
    throw new Error("SECRET_LIKE_INCIDENT_REJECTED");
  }
  if (incidents.length) {
    show({recorded:false,existing:incidents[0].id,next_action:"UPDATE_EXISTING_OGE_INCIDENT_NOT_DUPLICATE"});
    process.exit(0);
  }
  const id = [issue,safeText(opt.component,50).toUpperCase().replace(/[^A-Z0-9]+/g,"-"),http||"NHTTP",(code||"UNCODE").toUpperCase().replace(/[^A-Z0-9]+/g,"-")].join("-").slice(0,110);
  const entry = {
    id,issues:[issue],status:"OPEN_DIAGNOSIS",confidence:"UNVERIFIED",
    component:safeText(opt.component,120),operation:safeText(opt.operation||"UNKNOWN",160),
    http_status:http,error_code:code ? code.toUpperCase() : null,
    symptom:safeText(opt.symptom || "Needs diagnosis",300),
    cause:"NOT_YET_CONFIRMED",
    diagnostic_steps:["Read structured response and failing step.","Check scope, provider, binding and permission without mutating live state.","Attach source/CI evidence; identify and test only the narrow fix."],
    remedy:"PENDING_VERIFICATION",guardrail:"NO_UNVERIFIED_AUTO_FIX_OR_PRIVILEGE_BYPASS",
    evidence:[evidence],fix_commit:null,next_action:"INVESTIGATE_AND_UPDATE_SAME_OGE"
  };
  db.incidents.push(entry);
  writeFileSync(source,JSON.stringify(db,null,2)+"\n");
  show({recorded:true,id,source:"config/oge-error-memory.json",next_action:"COMMIT_STAGING_AND_COMMENT_ON_EXISTING_LINEAR_OGE"});
} else throw new Error("SUPPORTED_COMMANDS: lookup, record");
