import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import { createHash, createHmac, randomBytes } from 'node:crypto';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const temp = await mkdtemp(join(tmpdir(), 'claude-yellow-stone-test-'));
const modules = ['app-auth', 'blue-diamond-registry', 'wave-mcp-oauth', 'claude-yellow-stone-tools', 'wave-manus-mcp-api'];
for (const name of modules) {
  let code = await readFile(join(root, 'worker', name + '.ts'), 'utf8');
  // Hono constructs routes only in createAuthApi; the session verifier tested
  // below is the production implementation and needs no HTTP framework.
  if (name === 'app-auth') code = code.replace(/^import .* from "hono";\n/m, 'const Hono = class {};\n');
  code = stripTypeScriptTypes(code, { mode: 'transform' }).replace(/from "\.\/([^".]+)"/g, 'from "./$1.mjs"');
  await writeFile(join(temp, name + '.mjs'), code);
}
const { handleWaveOAuth, verifyMcpAccessToken } = await import(pathToFileURL(join(temp, 'wave-mcp-oauth.mjs')));
const { handleWaveManusMcp } = await import(pathToFileURL(join(temp, 'wave-manus-mcp-api.mjs')));
const { hasOwnerSession } = await import(pathToFileURL(join(temp, 'app-auth.mjs')));
const origin = 'https://wave.ogenicchocolate.com';
const resource = origin + '/mcp';
const migration = await readFile(join(root, 'database/migrations/0016_oge_athena_oauth.sql'), 'utf8');
const hash = (s) => createHash('sha256').update(s).digest('base64url');
const allScopes = 'ogenic:read ogenic:sessions:read ogenic:write ogenic:execute';

function fixture() {
  const sql = new DatabaseSync(':memory:');
  sql.exec(migration);
  const env = { OGENIC_OPS_KEY: 'fixture-only-owner-signing-key', DB: { prepare(query) {
    let params = [];
    return { bind(...args) { params = args; return this; }, async run() { return sql.prepare(query).run(...params); }, async first() { return sql.prepare(query).get(...params) ?? null; }, async all() { return { results: sql.prepare(query).all(...params) }; } };
  } } };
  const payload = Buffer.from(JSON.stringify({ sub: 'ogenic-owner', role: 'owner', exp: Math.floor(Date.now() / 1000) + 300, nonce: 'fixture' })).toString('base64url');
  const owner = payload + '.' + createHmac('sha256', env.OGENIC_OPS_KEY).update(payload).digest('base64url');
  return { sql, env, owner };
}
async function register(env) {
  const response = await handleWaveOAuth(new Request(origin + '/oauth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client_name: 'Claude integration test', redirect_uris: ['https://claude.ai/oauth/callback'] }) }), env);
  assert.equal(response.status, 201);
  return response.json();
}
async function authorization(f, scope = allScopes) {
  const client = await register(f.env);
  const verifier = randomBytes(48).toString('base64url');
  const params = new URLSearchParams({ response_type: 'code', client_id: client.client_id, redirect_uri: 'https://claude.ai/oauth/callback', resource, scope, state: 'fixture-state', code_challenge: hash(verifier), code_challenge_method: 'S256', decision: 'approve' });
  const response = await handleWaveOAuth(new Request(origin + '/oauth/authorize', { method: 'POST', headers: { Origin: origin, Cookie: 'ogenic_owner_session=' + f.owner }, body: params }), f.env);
  assert.equal(response.status, 302);
  return { client, verifier, params, code: new URL(response.headers.get('location')).searchParams.get('code') };
}
async function exchange(env, a, verifier = a.verifier) {
  return handleWaveOAuth(new Request(origin + '/oauth/token', { method: 'POST', body: new URLSearchParams({ grant_type: 'authorization_code', client_id: a.client.client_id, code: a.code, code_verifier: verifier, redirect_uri: 'https://claude.ai/oauth/callback', resource }) }), env);
}
async function rpc(env, token, method, params, dispatch) {
  return handleWaveManusMcp(new Request(resource, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) }), env, dispatch);
}
function toolBody(packet) { return JSON.parse(packet.result.content[0].text); }

test('OAuth PKCE, single-use codes, rotation, revocation and client consent scopes', async () => {
  const f = fixture();
  try {
    const a = await authorization(f);
    assert.equal((await exchange(f.env, a, randomBytes(48).toString('base64url'))).status, 400);
    const response = await exchange(f.env, a); assert.equal(response.status, 200);
    const tokens = await response.json();
    assert.ok(tokens.scope.includes('ogenic:execute'));
    assert.equal((await exchange(f.env, a)).status, 400);
    assert.equal((await verifyMcpAccessToken(new Request(resource, { headers: { Authorization: 'Bearer ' + tokens.access_token } }), f.env)).ok, true);
    const rotate = () => handleWaveOAuth(new Request(origin + '/oauth/token', { method: 'POST', body: new URLSearchParams({ grant_type: 'refresh_token', client_id: a.client.client_id, refresh_token: tokens.refresh_token, resource }) }), f.env);
    const rotated = await rotate(); assert.equal(rotated.status, 200);
    const fresh = await rotated.json(); assert.notEqual(fresh.refresh_token, tokens.refresh_token);
    assert.equal((await rotate()).status, 400);
    const revoke = await handleWaveOAuth(new Request(origin + '/oauth/revoke', { method: 'POST', body: new URLSearchParams({ client_id: a.client.client_id, token: fresh.access_token }) }), f.env);
    assert.equal(revoke.status, 200);
    assert.equal((await rpc(f.env, fresh.access_token, 'tools/list', {})).status, 401);
    const serialized = JSON.stringify(f.sql.prepare('SELECT * FROM mcp_oauth_tokens').all());
    assert.ok(!serialized.includes(tokens.access_token) && !serialized.includes(tokens.refresh_token));
  } finally { f.sql.close(); }
});

test('read consent cannot execute; full consent reaches the existing authenticated Yellow Stone dispatcher', async () => {
  const f = fixture();
  try {
    const readGrant = await authorization(f, 'ogenic:read');
    const readToken = (await (await exchange(f.env, readGrant)).json()).access_token;
    let calls = 0;
    const dispatch = async (request) => {
      calls++; assert.equal(await hasOwnerSession(request, f.env), true);
      assert.equal(new URL(request.url).pathname, '/api/unifiend/command');
      const body = await request.json(); assert.equal(body.environment, 'staging');
      assert.equal(body.mode, 'execute'); assert.ok(request.headers.get('Idempotency-Key'));
      return Response.json({ ok: true, task: { id: 'fixture-task' }, execution: { status: 'QUEUED', consumer_proven: false } }, { status: 202 });
    };
    const args = { intent: 'Inspect existing workspace', capability: 'codex_selfhost', provider: 'openai', mode: 'execute' };
    const denied = await (await rpc(f.env, readToken, 'tools/call', { name: 'unifiend_command', arguments: args }, dispatch)).json();
    assert.equal(denied.result.isError, true); assert.equal(calls, 0);
    const fullGrant = await authorization(f);
    const fullToken = (await (await exchange(f.env, fullGrant)).json()).access_token;
    const listed = await (await rpc(f.env, fullToken, 'tools/list', {})).json();
    assert.equal(listed.result.tools.length, 11);
    assert.ok(listed.result.tools.some(t => t.name === 'yellow_stone_execute' && !t.annotations.readOnlyHint));
    const invoked = await (await rpc(f.env, fullToken, 'tools/call', { name: 'unifiend_command', arguments: args }, dispatch)).json();
    const result = toolBody(invoked); assert.equal(result.http_status, 202); assert.equal(result.result.execution.consumer_proven, false); assert.equal(calls, 1);
    assert.ok(!JSON.stringify(invoked).includes(f.env.OGENIC_OPS_KEY));
    const rejected = await (await rpc(f.env, fullToken, 'tools/call', { name: 'unifiend_command', arguments: { ...args, environment: 'production' } }, dispatch)).json();
    assert.equal(toolBody(rejected).code, 'ENVIRONMENT_SCOPE_MISMATCH'); assert.equal(calls, 1);
    f.sql.prepare('UPDATE mcp_oauth_tokens SET owner_id = ? WHERE token_hash = ?').run('different-owner', hash(fullToken));
    assert.equal((await rpc(f.env, fullToken, 'tools/list', {})).status, 401);
  } finally { f.sql.close(); }
});

test('unauthorized discovery challenges OAuth; cross-origin consent cannot grant access', async () => {
  const f = fixture();
  try {
    const response = await rpc(f.env, '', 'initialize', { protocolVersion: '2025-06-18' });
    assert.equal(response.status, 401); assert.ok(response.headers.get('www-authenticate').includes('/.well-known/oauth-protected-resource/mcp'));
    const response2 = await handleWaveOAuth(new Request(origin + '/oauth/authorize', { method: 'POST', headers: { Origin: 'https://untrusted.example', Cookie: 'ogenic_owner_session=' + f.owner }, body: new URLSearchParams({ decision: 'approve' }) }), f.env);
    assert.equal(response2.status, 403);
    const metadata = await (await handleWaveOAuth(new Request(origin + '/.well-known/oauth-authorization-server'), f.env)).json();
    assert.ok(metadata.scopes_supported.includes('ogenic:write'));
  } finally { f.sql.close(); }
});

process.on('exit', () => { void rm(temp, { recursive: true, force: true }); });
