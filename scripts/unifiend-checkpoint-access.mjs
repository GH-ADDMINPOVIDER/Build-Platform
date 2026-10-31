import { createHash } from "node:crypto";

const BASE = "https://wave.ogenicchocolate.com";
const DATABASE = "b4ac3a33-df80-47cf-8e75-7574e025b87b";
const TASK = "wavecmd_386a7dc72f4ab6a08d3335b86352aa14db94fa872a23314b6af48039f9e97cc2";
const AGENT = "unifiend-capability-access";

export async function reconcileCanonicalCheckpoint({ resolveSecret, request = fetch, evidence, runId }) {
  const report = { athena: "NOT_VERIFIED", d1_read: "NOT_VERIFIED", checkpoint_write: "NOT_PERFORMED", independent_readback: false };
  let stage = "owner_reference";
  const json = async (url, init) => {
    const response = await request(url, { ...init, redirect: "manual", signal: AbortSignal.timeout(15000) });
    if (!response.ok) { const error = new Error("HTTP_REJECTED"); error.status = response.status; throw error; }
    const result = await response.json();
    return { result, headers: response.headers };
  };
  try {
    if (!/^[0-9]{1,20}$/.test(runId || "") || !/^[a-f0-9]{40}$/.test(evidence.source_sha || "")) throw new Error("SOURCE_REFERENCE_REQUIRED");
    const ownerKey = await resolveSecret("OWNER_KEY_OPS");
    stage = "owner_session";
    const session = await json(`${BASE}/api/session`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ owner_key: ownerKey }) });
    const cookie = session.headers.get("set-cookie") || "";
    if (session.result.authenticated !== true || session.result.user?.role !== "owner" || !cookie.startsWith("ogenic_owner_session=")) throw new Error("OWNER_SESSION_NOT_VERIFIED");
    const headers = { "Content-Type": "application/json", Cookie: cookie.split(";", 1)[0] };
    stage = "athena_checkin";
    const checkin = await json(`${BASE}/api/blue-diamond/check-in`, { method: "POST", headers,
      body: JSON.stringify({ event: "RESUME_SESSION", intent: "Unifiend capability access verification and existing Ocian-S-Host recovery checkpoint. No deployment or certificate mutation." }) });
    if (checkin.result.ok !== true || checkin.result.canonical?.available !== true
      || checkin.result.canonical?.conversation_id !== "owner-main" || checkin.result.canonical?.session_line !== "1LSS_OWNER_MAIN") throw new Error("CANONICAL_CHECKIN_NOT_VERIFIED");
    report.athena = "VERIFIED_CHECKIN";
    report.canonical_sequence = checkin.result.canonical.latest_sequence;
    stage = "certificate_read";
    const certificate = await json(`${BASE}/api/system/certificate-lincenc`, { headers });
    if (certificate.result.ok !== true || certificate.result.integrity !== "D1_DOCUMENT_SHA256_MATCH"
      || !/^[a-f0-9]{64}$/.test(certificate.result.document_sha256 || "")) throw new Error("CERTIFICATE_INTEGRITY_NOT_VERIFIED");
    report.certificate_integrity = "D1_DOCUMENT_SHA256_MATCH";
    stage = "d1_reference";
    const account = await resolveSecret("CLOUDFLARE_ACCOUNT_ID");
    const token = await resolveSecret("CLOUDFLARE_API_TOKEN");
    if (!/^[a-f0-9]{32}$/i.test(account || "")) throw new Error("ACCOUNT_ID_INVALID");
    const queryUrl = `https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/${DATABASE}/query`;
    const query = async (sql, params) => {
      const response = await json(queryUrl, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ sql, params }) });
      if (response.result.success !== true || response.result.result?.[0]?.success !== true) throw new Error("D1_QUERY_REJECTED");
      return response.result.result[0].results;
    };
    stage = "d1_existing_task";
    const certificateReadback = await query("SELECT document_sha256 FROM certificate_lincenc WHERE certificate_id = ? LIMIT 1", [certificate.result.certificate_id]);
    if (certificateReadback?.[0]?.document_sha256 !== certificate.result.document_sha256) throw new Error("CERTIFICATE_READBACK_MISMATCH");
    report.certificate_independent_readback = true;
    const task = await query("SELECT id FROM agent_tasks WHERE id = ? LIMIT 1", [TASK]);
    report.d1_read = "VERIFIED";
    if (task?.[0]?.id !== TASK) throw new Error("EXISTING_TASK_NOT_FOUND");
    const reference = `github-actions://1429580446/${runId}`;
    const hash = createHash("sha256").update(JSON.stringify(evidence)).digest("hex");
    stage = "checkpoint_write";
    const saved = await json(`${BASE}/api/local-agent-team/tasks/${TASK}/checkpoint`, { method: "POST", headers,
      body: JSON.stringify({ agent_id: AGENT, checkpoint_ref: reference, state_hash: hash }) });
    if (saved.result.ok !== true || saved.result.checkpoint?.persisted !== true) throw new Error("CHECKPOINT_NOT_ACKNOWLEDGED");
    report.checkpoint_write = "ACKNOWLEDGED";
    stage = "checkpoint_readback";
    const rows = await query("SELECT checkpoint_ref, state_hash FROM agent_checkpoints WHERE task_id = ? AND agent_id = ? LIMIT 1", [TASK, AGENT]);
    if (rows?.[0]?.checkpoint_ref !== reference || rows[0].state_hash !== hash) throw new Error("CHECKPOINT_READBACK_MISMATCH");
    report.checkpoint_write = "VERIFIED";
    report.independent_readback = true;
    report.checkpoint_ref = reference;
    report.state_hash = hash;
  } catch (error) {
    report.failure = { stage, code: ["SOURCE_REFERENCE_REQUIRED", "OWNER_SESSION_NOT_VERIFIED", "CANONICAL_CHECKIN_NOT_VERIFIED", "CERTIFICATE_INTEGRITY_NOT_VERIFIED", "CERTIFICATE_READBACK_MISMATCH", "ACCOUNT_ID_INVALID", "D1_QUERY_REJECTED", "EXISTING_TASK_NOT_FOUND", "CHECKPOINT_NOT_ACKNOWLEDGED", "CHECKPOINT_READBACK_MISMATCH"].includes(error.message) ? error.message : "REQUEST_FAILED", http_status: Number.isInteger(error.status) ? error.status : null };
  }
  return report;
}
