import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";

// Integration harness: actual compiled Hono endpoint and real Owner-session HMAC.
// Provider is intercepted in-process; no real network, credentials or D1 writes.
test("MCP read bridge: signed session, allowlist, lifecycle, tool call and redaction", async () => {
  const bundled = await build({
    entryPoints: ["worker/mcp-config-api.ts"],
    platform: "node", format: "esm", target: "es2022",
    bundle: true, write: false, logLevel: "silent",
  });
  const mod = await import("data:text/javascript;base64," +
    Buffer.from(bundled.outputFiles[0].text).toString("base64"));
  const app = mod.createMcpConfigApi();

  const authBuild = await build({
    entryPoints: ["worker/app-auth.ts"],
    platform: "node", format: "esm", target: "es2022",
    bundle: true, write: false, logLevel: "silent",
  });
  const authMod = await import("data:text/javascript;base64," +
    Buffer.from(authBuild.outputFiles[0].text).toString("base64"));
  const auth = authMod.createAuthApi();

  const origin = "https://wave.ogenicchocolate.com";
  const endpoint = "https://mcp.linear.app/mcp";
  const state = {
    advertised: true,
    error: false,
    allowlisted: true,
    calls: [],
    row: {
      id: "mcp:linear:staging", provider_id: "linear", environment: "staging",
      binding_type: "mcp", secret_ref: "env:OGE132_MCP_FIXTURE_TOKEN",
      status: "configured", last_checked_at: null,
      updated_at: "2026-10-19T00:00:00Z", metadata_json: "",
    },
  };
  const updateMeta = () => {
    state.row.metadata_json = JSON.stringify({
      endpoint, label: "Test MCP",
      read_tools_allowlist: state.allowlisted ? ["read_status"] : [],
    });
  };
  updateMeta();
  const env = {
    OGENIC_OPS_KEY: "OGE132_LOCAL_FIXTURE_KEY_NEVER_REAL",
    OGE132_MCP_FIXTURE_TOKEN: "OGE132_FIXTURE_UPSTREAM_ONLY",
    DB: {
      prepare(sql) {
        assert.match(sql, /provider_bindings/);
        return {
          bind(...params) {
            assert.equal(params[0], "linear");
            return {
              async first() { return state.row; },
              async all() { return { results: [state.row] }; },
            };
          },
        };
      },
    },
  };
  const login = await auth.fetch(new Request(origin + "/api/session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ owner_key: env.OGENIC_OPS_KEY }),
  }), env);
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie").split(";")[0];
  assert.match(cookie, /^ogenic_owner_session=/);

  const request = (tool = "read_status", args = {}, authCookie = cookie) =>
    new Request(origin + "/api/mcp-config/read-tool", {
      method: "POST",
      headers: { "content-type": "application/json", ...(authCookie ? {cookie: authCookie} : {}) },
      body: JSON.stringify({provider: "linear", tool, arguments: args}),
    });

  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (input, options = {}) => {
    assert.equal(String(input), endpoint, "MCP request must use existing allowlisted endpoint");
    assert.equal(options.headers?.Authorization, "Bearer OGE132_FIXTURE_UPSTREAM_ONLY");
    const body = JSON.parse(options.body);
    state.calls.push({
      method: body.method,
      session: options.headers["Mcp-Session-Id"] ?? null,
      hasId: Object.hasOwn(body, "id"),
    });
    if (body.method === "initialize") {
      return new Response(JSON.stringify({
        jsonrpc: "2.0", id: body.id,
        result: { protocolVersion: "2025-06-18", capabilities: { tools: {} } },
      }), {status: 200, headers: {"Mcp-Session-Id": "fixture-session-01"}});
    }
    if (body.method === "notifications/initialized") {
      assert.equal(Object.hasOwn(body, "id"), false);
      return new Response(null, {status: 202});
    }
    if (body.method === "tools/list") {
      return new Response(JSON.stringify({
        jsonrpc: "2.0", id: body.id,
        result: {tools: [{
          name: "read_status",
          description: "Safe test-only read",
          annotations: {readOnlyHint: state.advertised},
          inputSchema: {type: "object", properties: {}, additionalProperties: false},
        }]},
      }), {status: 200});
    }
    if (body.method === "tools/call") {
      assert.equal(body.params.name, "read_status");
      return new Response(JSON.stringify({
        jsonrpc: "2.0", id: body.id, result: {
          isError: state.error,
          content: [{type: "text", text: "status ok; Bearer TESTSECRETSTRING"}],
          private_key: "never-return-me",
        },
      }), {status: 200});
    }
    throw new Error("Unexpected MCP method " + body.method);
  };

  try {
    // A raw OPS key may not substitute for a signed Owner session.
    let response = await app.fetch(request("read_status", {}, ""), env);
    assert.equal(response.status, 401);
    assert.equal(state.calls.length, 0);

    state.allowlisted = false;
    updateMeta();
    response = await app.fetch(request(), env);
    assert.equal(response.status, 409);
    assert.equal((await response.json()).code, "HUMAN_APPROVAL_REQUIRED");
    assert.equal(state.calls.length, 0);

    state.allowlisted = true;
    updateMeta();
    response = await app.fetch(request("delete_repository"), env);
    assert.equal(response.status, 409);
    assert.equal(state.calls.length, 0);

    // Reject secret-shaped argument keys before touching the remote MCP.
    response = await app.fetch(request("read_status", {password: "fixture"}), env);
    assert.equal(response.status, 422);
    assert.equal((await response.json()).code, "UNSAFE_TOOL_ARGUMENTS");
    assert.equal(state.calls.length, 0);

    // Provider hint is a second gate, not a replacement for Owner allowlist.
    state.advertised = false;
    response = await app.fetch(request(), env);
    assert.equal(response.status, 409);
    assert.equal((await response.json()).code, "MCP_READ_ANNOTATION_REQUIRED");
    assert.deepEqual(state.calls.map(x => x.method), [
      "initialize", "notifications/initialized", "tools/list",
    ]);
    assert.equal(state.calls[1].session, "fixture-session-01");
    assert.equal(state.calls[2].session, "fixture-session-01");
    assert.equal(state.calls[1].hasId, false);
    state.calls.length = 0;

    state.advertised = true;
    response = await app.fetch(request(), env);
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.ok, true);
    assert.equal(result.execution_authority, "OWNER_SIGNED_READ_ONLY");
    assert.equal(result.provider, "linear");
    assert.equal(result.live_provider_tool_invoked, true); // Fixture; not an external proof.
    assert.deepEqual(state.calls.map(x => x.method), [
      "initialize", "notifications/initialized", "tools/list", "tools/call",
    ]);
    for (const call of state.calls.slice(1)) assert.equal(call.session, "fixture-session-01");
    const sanitized = JSON.stringify(result);
    assert.equal(sanitized.includes("never-return-me"), false);
    assert.equal(sanitized.includes("TESTSECRETSTRING"), false);
    assert.match(sanitized, /\[REDACTED\]/);
    state.calls.length = 0;

    state.error = true;
    response = await app.fetch(request(), env);
    assert.equal(response.status, 502);
    assert.equal((await response.json()).ok, false);
  } finally {
    globalThis.fetch = previousFetch;
  }
});
