import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";

// Exact owner n8n Registry MCP URL, not the Railway n8n runtime URL.
// This is a local Hono + mocked D1 registration contract, NEVER a live binding update.
test("TS endpoint URL segregation: exact n8n registry MCP accepted, lookalikes denied", async () => {
  const bundled = await build({entryPoints:["worker/mcp-config-api.ts"],bundle:true,write:false,
    platform:"node",format:"esm",target:"es2022",logLevel:"silent"});
  const mod = await import("data:text/javascript;base64," +
    Buffer.from(bundled.outputFiles[0].text).toString("base64"));
  const app = mod.createMcpConfigApi();
  const writes = [];
  const env = {
    OGENIC_OPS_KEY:"OGE133_FIXTURE_OPS_NOT_REAL",
    DB:{prepare(sql){return {bind(...args){return {
      async first(){return sql.includes("FROM providers")?{id:"n8n"}:null;},
      async run(){writes.push({sql,args});return {success:true};},
    }}}}},
  };
  const action = async endpoint => {
    const response=await app.fetch(new Request("https://wave.ogenicchocolate.com/api/mcp-config/action",{
      method:"POST",
      headers:{"content-type":"application/json","x-ogenic-ops-key":"OGE133_FIXTURE_OPS_NOT_REAL"},
      body:JSON.stringify({provider:"n8n",action:"register",endpoint,approved:true}),
    }),env);
    return {status:response.status,body:await response.json()};
  };
  const good=await action("https://ogenic-registry.app.n8n.cloud/mcp-server/http");
  assert.equal(good.status,200);
  assert.equal(good.body.endpoint,"https://ogenic-registry.app.n8n.cloud/mcp-server/http");
  assert.equal(writes.length,1);
  for (const endpoint of [
    "https://ogenic-registry.app.n8n.cloud.evil.test/mcp-server/http",
    "https://rogue.n8n.cloud/mcp-server/http",
    "https://n8n-staging-76b7.up.railway.app/healthz",
    "http://ogenic-registry.app.n8n.cloud/mcp-server/http",
    "https://u:p@ogenic-registry.app.n8n.cloud/mcp-server/http",
    "https://ogenic-registry.app.n8n.cloud:8443/mcp-server/http",
  ]) {
    const blocked=await action(endpoint);
    assert.equal(blocked.status,400,endpoint);
    assert.equal(blocked.body.code,"MCP_ENDPOINT_NOT_ALLOWLISTED");
  }
  assert.equal(writes.length,1,"Disallowed hosts must not update D1");
});
