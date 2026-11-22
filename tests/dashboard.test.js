import test from 'node:test';
import assert from 'node:assert/strict';
import { createManagementApi, listenLocal } from '../src/api/createManagementApi.js';

test('dashboard assets are served with restrictive headers', async () => {
  const api = createManagementApi({
    authStore: { authenticate() {}, login() {} },
    accessController: { authorize() {} }
  });
  const address = await listenLocal(api, { port: 0 });
  try {
    for (const [path, type] of [['/dashboard', 'text/html'], ['/dashboard/app.js', 'text/javascript'], ['/dashboard/style.css', 'text/css']]) {
      const res = await fetch(`http://127.0.0.1:${address.port}${path}`);
      assert.equal(res.status, 200);
      assert.match(res.headers.get('content-type'), new RegExp(type));
      assert.match(res.headers.get('content-security-policy'), /default-src 'none'/);
      assert.equal(res.headers.get('cache-control'), 'no-store');
      assert.ok((await res.text()).length > 100);
    }
  } finally { await new Promise(resolve => api.close(resolve)); }
});

test('session listing is authenticated and ownership filtered', async () => {
  const api = createManagementApi({
    authStore: { login() {}, authenticate: () => ({ userId: 'alice' }) },
    accessController: {
      authorize: (_, id) => { if (id !== 'mine') throw new Error('Denied'); },
      sessions: { listSessions: () => [{ id: 'mine' }, { id: 'theirs' }] },
      getStatus: () => 'disconnected'
    }
  });
  const address = await listenLocal(api, { port: 0 });
  try {
    const base = `http://127.0.0.1:${address.port}`;
    assert.equal((await fetch(`${base}/sessions`)).status, 401);
    const res = await fetch(`${base}/sessions`, { headers: { authorization: `Bearer ${'a'.repeat(64)}` } });
    assert.deepEqual(await res.json(), { sessions: [{ sessionId: 'mine', status: 'disconnected' }] });
  } finally { await new Promise(resolve => api.close(resolve)); }
});
