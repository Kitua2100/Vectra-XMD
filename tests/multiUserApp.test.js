import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import OwnershipStore from '../src/core/OwnershipStore.js';
import UserAuthStore from '../src/core/UserAuthStore.js';
import createMultiUserApp from '../src/app/createMultiUserApp.js';

async function fixture(t) {
  const dir = await mkdtemp(path.join(tmpdir(), 'vectra-phase11-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const owners = await new OwnershipStore({ filePath: path.join(dir, 'session-owners.json') }).load();
  await owners.assign('device1', 'alice');
  const users = await new UserAuthStore({ filePath: path.join(dir, 'users.json') }).load();
  await users.createUser('alice', 'A-long-password-123!');
  let created = 0;
  const app = await createMultiUserApp({
    privateDir: dir,
    socketFactory: async () => {
      created++;
      return { ev: new EventEmitter(), end: async () => {} };
    }
  });
  t.after(async () => { await app.shutdown(); });
  return { app, getCreated: () => created };
}

test('restores persistent owners without auto-connecting', async t => {
  const { app, getCreated } = await fixture(t);
  assert.equal(app.sessionManager.getSession('device1').status, 'disconnected');
  assert.equal(app.accessController.getStatus('alice', 'device1'), 'disconnected');
  assert.equal(getCreated(), 0);
});

test('prevents a different user from accessing a restored session', async t => {
  const { app } = await fixture(t);
  assert.throws(() => app.accessController.getStatus('bob', 'device1'), /Access denied/);
});

test('local API authenticates and rejects unauthorized session access', async t => {
  const { app } = await fixture(t);
  const address = await app.listen({ port: 0 });
  assert.equal(address.address, '127.0.0.1');
  const base = `http://127.0.0.1:${address.port}`;
  const response = await fetch(`${base}/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ userId: 'alice', password: 'A-long-password-123!' })
  });
  assert.equal(response.status, 200);
  const { token } = await response.json();
  const status = await fetch(`${base}/sessions/device1/status`, { headers: { authorization: `Bearer ${token}` } });
  assert.equal(status.status, 200);
  assert.equal((await status.json()).status, 'disconnected');
  const denied = await fetch(`${base}/sessions/not-mine/status`, { headers: { authorization: `Bearer ${token}` } });
  assert.equal(denied.status, 404);
});

test('refuses non-loopback binds', async t => {
  const { app } = await fixture(t);
  await assert.rejects(app.listen({ host: '0.0.0.0', port: 0 }), /loopback/);
});

test('fails closed if persisted owners exceed configured limit', async t => {
  const { app } = await fixture(t);
  await assert.rejects(createMultiUserApp({
    privateDir: path.dirname(app.ownershipStore.filePath), maxSessions: 0
  }), /session limit|positive integer/);
});
