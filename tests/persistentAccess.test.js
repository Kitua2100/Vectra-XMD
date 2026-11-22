import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import SessionManager from '../src/core/SessionManager.js';
import OwnershipStore from '../src/core/OwnershipStore.js';
import SessionAccessController from '../src/core/SessionAccessController.js';

async function fixture(t, existingFile) {
  const dir = existingFile ? null : await fs.mkdtemp(path.join(os.tmpdir(), 'vectra-persist-access-'));
  if (dir) t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const filePath = existingFile ?? path.join(dir, 'private', 'owners.json');
  const store = await new OwnershipStore({ filePath }).load();
  const sessions = new SessionManager();
  const sockets = new Map();
  const connections = {
    async connect(id) { const socket = { ev: { on() {}, off() {} } }; sockets.set(id, socket); return { sessionId: id, status: 'connecting' }; },
    getSocket: id => sockets.get(id),
    getStatus: id => sockets.has(id) ? 'connecting' : 'disconnected',
    async disconnect(id) { return sockets.delete(id); }
  };
  const pairing = { async requestPairingCode() { return { code: 'mock' }; } };
  const access = await SessionAccessController.fromOwnershipStore({
    ownershipStore: store, sessionManager: sessions, connectionManager: connections, pairingManager: pairing
  });
  return { access, store, sessions, filePath };
}

test('trusted provision persists and enforces access', async t => {
  const { access, sessions, store } = await fixture(t);
  sessions.createSession('s1');
  await access.provisionOwner('alice', 's1');
  assert.equal(store.getOwner('s1'), 'alice');
  assert.equal(access.getStatus('alice', 's1'), 'disconnected');
  assert.throws(() => access.getStatus('bob', 's1'), /Access denied/);
});

test('restart restores registered sessions and authorization', async t => {
  const first = await fixture(t);
  first.sessions.createSession('s1');
  await first.access.provisionOwner('alice', 's1');
  const restored = await fixture(t, first.filePath);
  assert.ok(restored.sessions.getSession('s1'));
  assert.equal(restored.access.getStatus('alice', 's1'), 'disconnected');
  assert.throws(() => restored.access.getStatus('bob', 's1'), /Access denied/);
});

test('rejects legacy in-memory assignment in persistent mode', async t => {
  const { access, sessions } = await fixture(t);
  sessions.createSession('s1');
  assert.throws(() => access.registerOwner('mallory', 's1'), /trusted async/);
});

test('persistent revoke removes access after disconnect', async t => {
  const { access, sessions, store } = await fixture(t);
  sessions.createSession('s1');
  await access.provisionOwner('alice', 's1');
  await access.connect('alice', 's1');
  await access.revoke('alice', 's1');
  assert.equal(store.getOwner('s1'), null);
  assert.throws(() => access.getStatus('alice', 's1'), /Access denied/);
});

test('failed provisioning cannot claim existing owner', async t => {
  const { access, sessions } = await fixture(t);
  sessions.createSession('s1');
  await access.provisionOwner('alice', 's1');
  await assert.rejects(access.provisionOwner('bob', 's1'), /already assigned/);
  assert.equal(access.getStatus('alice', 's1'), 'disconnected');
});

test('corrupt registry prevents initialization', async t => {
  const { filePath } = await fixture(t);
  await fs.writeFile(filePath, '{invalid');
  await assert.rejects(new OwnershipStore({ filePath }).load(), SyntaxError);
});
