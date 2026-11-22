import test from 'node:test';
import assert from 'node:assert/strict';
import { createManagementApi, listenLocal } from '../src/api/createManagementApi.js';

const TOKEN = 'a'.repeat(64);
function setup() {
  const calls = [];
  const authStore = {
    async login(id, pass) { if (id !== 'alice' || pass !== 'valid-password') throw new Error('bad'); return { token: TOKEN, userId: 'alice' }; },
    authenticate(token) { if (token !== TOKEN) throw new Error('bad'); return { userId: 'alice' }; },
    async logout(token) { calls.push(['logout', token]); }
  };
  const accessController = {
    authorize(id, sid) { if (id !== 'alice' || sid !== 's1') throw new Error('denied'); },
    getStatus() { return 'connecting'; },
    getQR() { return 'private-qr'; },
    async connect(id, sid) { calls.push(['connect', id, sid]); return { status: 'connecting' }; },
    async disconnect() { return true; },
    async requestPairingCode(id, sid, phone) { calls.push(['pair', id, sid, phone]); return { code: 'private-code' }; }
  };
  return { api: createManagementApi({ authStore, accessController }), calls };
}
async function withApi(fn) {
  const { api, calls } = setup();
  const addr = await listenLocal(api, { port: 0 });
  const base = `http://127.0.0.1:${addr.port}`;
  const request = (path, { method = 'GET', token, body } = {}) => fetch(base + path, {
    method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  try { await fn(request, calls); } finally { await new Promise((resolve, reject) => api.close(err => err ? reject(err) : resolve())); }
}
test('binds only to loopback', async () => {
  const { api } = setup();
  await assert.rejects(listenLocal(api, { host: '0.0.0.0', port: 0 }), /loopback/);
});
test('health is available', async () => withApi(async request => {
  const r = await request('/health'); assert.equal(r.status, 200); const body = await r.json();
  assert.equal(body.ok, true);
  assert.equal(typeof body.uptimeSeconds, 'number');
  assert.ok(body.uptimeSeconds >= 0);
}));
test('rejects unauthenticated session access', async () => withApi(async request => {
  assert.equal((await request('/sessions/s1/status')).status, 401);
}));
test('authenticates and returns a token', async () => withApi(async request => {
  const r = await request('/auth/login', { method: 'POST', body: { userId: 'alice', password: 'valid-password' } });
  assert.equal(r.status, 200); assert.equal((await r.json()).token, TOKEN);
}));
test('hides sessions not owned by user', async () => withApi(async request => {
  assert.equal((await request('/sessions/other/status', { token: TOKEN })).status, 404);
}));
test('returns owned status and QR', async () => withApi(async request => {
  assert.equal((await (await request('/sessions/s1/status', { token: TOKEN })).json()).status, 'connecting');
  assert.equal((await (await request('/sessions/s1/qr', { token: TOKEN })).json()).qr, 'private-qr');
}));
test('routes connect and pairing under authenticated principal', async () => withApi(async (request, calls) => {
  assert.equal((await request('/sessions/s1/connect', { token: TOKEN, method: 'POST' })).status, 200);
  assert.equal((await request('/sessions/s1/pair', { token: TOKEN, method: 'POST', body: { phoneNumber: '254712345678' } })).status, 200);
  assert.deepEqual(calls, [['connect', 'alice', 's1'], ['pair', 'alice', 's1', '254712345678']]);
}));
test('rejects unauthorized owner provisioning routes', async () => withApi(async request => {
  assert.equal((await request('/users', { token: TOKEN, method: 'POST' })).status, 404);
}));
test('throttles login requests by IP', async () => withApi(async request => {
  for (let i = 0; i < 5; i++) assert.equal((await request('/auth/login', { method: 'POST', body: { userId: 'alice', password: 'bad' } })).status, 401);
  assert.equal((await request('/auth/login', { method: 'POST', body: { userId: 'alice', password: 'valid-password' } })).status, 429);
}));
test('logout uses bearer token', async () => withApi(async (request, calls) => {
  assert.equal((await request('/auth/logout', { method: 'POST', token: TOKEN })).status, 200);
  assert.deepEqual(calls, [['logout', TOKEN]]);
}));
