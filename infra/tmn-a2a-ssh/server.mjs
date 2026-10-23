// Staging A2A ingress on OCIAN-S HOST, protected by SSH loopback and a scoped bearer.
// Only read-only tmn.runtime.probe is executable. It does NOT authorize WAVE/TMN jobs.
import { createServer } from "node:http";
import { createHash, timingSafeEqual } from "node:crypto";
import { hostname } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateWaveTaskEnvelope } from "../../worker/task-envelope-contract.ts";

const PORT = 18761;
const MAX_BYTES = 65536;
const TASKS_MAX = 128;

function send(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  res.end(JSON.stringify(body));
}

function fail(id, code, message) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

function tokenMatches(header, configured) {
  if (typeof configured !== "string" || configured.length < 16 ||
      typeof header !== "string" || !header.startsWith("Bearer ")) return false;
  const supplied = Buffer.from(header.slice(7), "utf8");
  const expected = Buffer.from(configured, "utf8");
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

function agentCard() {
  const base = "http://127.0.0.1:" + PORT;
  return {
    name: "WAVE TMN Docker SSH Adapter",
    description: "Private, SSH-only, read-only A2A Docker probe; no unrestricted command execution.",
    version: "0.1.0",
    protocolVersion: "0.3.0",
    url: base + "/a2a",
    supportedInterfaces: [{ url: base + "/a2a", protocolBinding: "JSONRPC", protocolVersion: "0.3.0" }],
    defaultInputModes: ["text"],
    defaultOutputModes: ["text"],
    capabilities: { streaming: false, pushNotifications: false, stateTransitionHistory: false },
    securitySchemes: { waveScopedBearer: { type: "http", scheme: "bearer" } },
    security: [{ waveScopedBearer: [] }],
    skills: [{ id: "tmn.runtime.probe", name: "Read-only Docker runtime probe", description: "Bounded local A2A envelope validation and Docker-process evidence only.", tags: ["tmn", "docker", "staging"], examples: ["tmn.runtime.probe"] }]
  };
}

export function makeServer(token = process.env.WAVE_TMN_A2A_TOKEN) {
  if (typeof token !== "string" || token.length < 16) {
    throw new Error("WAVE_TMN_A2A_TOKEN_MISSING_FAIL_CLOSED");
  }
  const tasks = new Map();
  return createServer(async (req, res) => {
    if (req.method === "GET" && req.url === "/healthz") {
      send(res, 200, { ok: true, service: "wave-tmn-a2a-docker", scope: "staging-readonly", host_process: hostname() });
      return;
    }
    if (req.method === "GET" && req.url === "/.well-known/agent-card.json") {
      if (!tokenMatches(req.headers.authorization, token)) {
        send(res, 401, { ok: false, code: "A2A_AUTH_REQUIRED" });
        return;
      }
      send(res, 200, agentCard());
      return;
    }
    if (req.method !== "POST" || req.url !== "/a2a") {
      send(res, 404, { ok: false, code: "NOT_FOUND" });
      return;
    }
    if (!tokenMatches(req.headers.authorization, token)) {
      send(res, 401, { ok: false, code: "A2A_AUTH_REQUIRED" });
      return;
    }
    let bytes = 0;
    const chunks = [];
    try {
      for await (const chunk of req) {
        bytes += chunk.length;
        if (bytes > MAX_BYTES) {
          send(res, 413, { ok: false, code: "A2A_PAYLOAD_TOO_LARGE" });
          return;
        }
        chunks.push(chunk);
      }
    } catch {
      if (!res.writableEnded) send(res, 400, { ok: false, code: "BAD_BODY" });
      return;
    }
    let rpc;
    try { rpc = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
    catch { send(res, 400, fail(null, -32700, "Parse error")); return; }
    const id = typeof rpc?.id === "number" || typeof rpc?.id === "string" ? rpc.id : null;
    if (rpc?.jsonrpc !== "2.0" || id === null || typeof rpc.method !== "string") {
      send(res, 400, fail(id, -32600, "Invalid JSON-RPC request"));
      return;
    }
    if (rpc.method === "tasks/get") {
      const key = rpc.params?.id;
      const task = typeof key === "string" ? tasks.get(key)?.task : undefined;
      send(res, 200, task
        ? { jsonrpc: "2.0", id, result: task }
        : fail(id, -32001, "Task not found in ephemeral probe cache"));
      return;
    }
    if (rpc.method !== "message/send") {
      send(res, 200, fail(id, -32601, "Method not enabled on protected TMN Docker adapter"));
      return;
    }
    const message = rpc.params?.message;
    const envelope = message?.metadata?.wave_task_envelope;
    const check = validateWaveTaskEnvelope(envelope);
    if (!check.ok) {
      send(res, 200, fail(id, -32602, "WAVE_TASK_ENVELOPE_REJECTED_" + check.code));
      return;
    }
    const e = check.envelope;
    const textPart = message?.parts?.length === 1 ? message.parts[0] : null;
    // An ATHENA/YELLOW label in JSON is NOT cryptographic authorization.
    // Do not dispatch, write to D1, run arbitrary commands, or simulate a full A2A E2E.
    if (e.instruction !== "tmn.runtime.probe" ||
        textPart?.kind !== "text" || textPart.text !== "tmn.runtime.probe" ||
        e.scope.target_zone !== "TMN" || e.scope.permission !== "READ" ||
        e.scope.capability !== "tmn.runtime.probe" ||
        e.execution.state !== "TASK_IN" || e.fallback.allowed !== false ||
        e.execution.executor !== "TMN" ||
        message.contextId !== (e.context.a2a_context_id || e.context.context_ref)) {
      send(res, 200, fail(id, -32003, "EXECUTION_NOT_AUTHORIZED_ONLY_LOCAL_READONLY_PROBE"));
      return;
    }
    const digest = createHash("sha256").update(JSON.stringify({
      taskId: e.task_id, key: e.idempotency_key, context: e.context.context_ref,
      revision: e.context.context_revision, mode: "DOCKER_LOCAL_PROBE_ONLY"
    })).digest("hex");
    if (tasks.has(e.task_id)) {
      const prior = tasks.get(e.task_id);
      if (prior.digest !== digest) {
        send(res, 200, fail(id, -32004, "IDEMPOTENCY_CONFLICT"));
        return;
      }
      send(res, 200, { jsonrpc: "2.0", id, result: prior.task });
      return;
    }
    const task = {
      id: e.task_id,
      contextId: message.contextId,
      status: { state: "completed", timestamp: new Date().toISOString() },
      artifacts: [{
        artifactId: "tmn-docker-probe-" + digest.slice(0, 16),
        name: "Container-only execution evidence",
        parts: [{ kind: "data", data: {
          probe: "PASS", scope: "DOCKER_LOCAL_ONLY_NO_WAVE_DISPATCH",
          result_sha256: digest, process_version: process.version,
          container_hostname: hostname(), ssh_boundary: "HOST_LOOPBACK_ONLY",
          canonical_d1_receipt: false, tmn_command_executed: false
        } }]
      }],
      history: [message]
    };
    if (tasks.size >= TASKS_MAX) tasks.delete(tasks.keys().next().value);
    tasks.set(e.task_id, { digest, task });
    send(res, 200, { jsonrpc: "2.0", id, result: task });
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = makeServer();
  server.listen(PORT, "0.0.0.0", () => {
    console.log("WAVE_TMN_A2A_STAGING_LISTEN_CONTAINER_PORT=" + PORT);
  });
}
