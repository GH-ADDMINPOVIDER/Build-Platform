import catalog from "../config/oge-error-memory.json";

export type IncidentLookup = {
  issue?: string | null;
  http?: number | null;
  code?: string | null;
  component?: string | null;
};
type Incident = (typeof catalog.incidents)[number];

const normIssue = (value: unknown) => String(value ?? "").trim().toUpperCase().replace(/^OGE\s*[-#:]?\s*(\d+)$/i, "OGE-$1").slice(0, 24);
const norm = (value: unknown) => String(value ?? "").trim().toLowerCase().slice(0, 120);

function evidenceMatches(entry: Incident, query: IncidentLookup) {
  const issue = normIssue(query.issue);
  const code = norm(query.code);
  const component = norm(query.component);
  const http = Number(query.http);
  if (issue && !entry.issues.includes(issue)) return false;
  if (Number.isInteger(http) && http > 0 && entry.http_status !== http) return false;
  if (code && entry.error_code && norm(entry.error_code) !== code) return false;
  if (component && !norm(entry.component).includes(component)) return false;
  return true;
}

/** Advisory only. HTTP status alone is NEVER a sufficient incident identity. */
export function lookupOgeIncident(query: IncidentLookup) {
  const issue = normIssue(query.issue);
  const code = norm(query.code);
  const component = norm(query.component);
  const http = Number(query.http);
  const isHttp = Number.isInteger(http) && http >= 100 && http <= 599;
  const hint = catalog.http_hints.find((entry) => entry.http_status === http) ?? null;

  // Do not misdiagnose OGE-10 with OGE-35 just because both have HTTP 404.
  if (!issue && !code && !component) {
    return {
      matched: false, issue: null, incident: null, http_hint: isHttp ? hint : null,
      next_action: "PROVIDE_OGE_ID_AND_STRUCTURED_ERROR_CODE_OR_COMPONENT",
      authority: "DIAGNOSTIC_ONLY_NEVER_EXECUTION_APPROVAL",
    };
  }

  const matches = catalog.incidents.filter((entry) => evidenceMatches(entry, query));
  const ranked = matches.sort((a, b) =>
    Number(b.issues.includes(issue)) - Number(a.issues.includes(issue)) ||
    Number(Boolean(code && b.error_code && norm(b.error_code) === code)) - Number(Boolean(code && a.error_code && norm(a.error_code) === code)) ||
    Number(Boolean(component && norm(b.component) === component)) - Number(Boolean(component && norm(a.component) === component))
  );
  const selected = ranked[0] ?? null;
  return {
    matched: Boolean(selected),
    issue: issue || null,
    incident: selected,
    http_hint: isHttp ? hint : null,
    next_action: selected?.next_action ?? "RECORD_NEW_FINGERPRINT_ON_EXISTING_OGE_WITH_REAL_LOG_EVIDENCE",
    authority: "DIAGNOSTIC_ONLY_NEVER_EXECUTION_APPROVAL",
  };
}

export const OGE_ERROR_MEMORY_VERSION = catalog.schema_version;
