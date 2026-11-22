import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import UserAuthStore from '../src/core/UserAuthStore.js';
import OwnershipStore from '../src/core/OwnershipStore.js';
import SessionAdministration from '../src/app/SessionAdministration.js';

async function setup(t, maxSessions = 3) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'vectra-admin-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const users = await new UserAuthStore({ filePath: path.join(dir, 'users.json') }).load();
  const ownership = await new OwnershipStore({ filePath: path.join(dir, 'owners.json') }).load();
  await users.createUser('alice', 'long-password-for-alice');
  await users.createUser('bob', 'long-password-for-bob');
  return { admin: new SessionAdministration({ users, ownership, maxSessions }), ownership, dir };
}

test('trusted admin assigns an existing user and persists ownership', async t => {
  const { admin, ownership, dir } = await setup(t);
  await admin.assign('alice', 'session1');
  assert.equal(ownership.getOwner('session1'), 'alice');
  assert.equal((await new OwnershipStore({ filePath: path.join(dir, 'owners.json') }).load()).getOwner('session1'), 'alice');
});
test('rejects unknown users', async t => {
  const { admin } = await setup(t);
  await assert.rejects(admin.assign('unknown', 'session1'), /User does not exist/);
});
test('rejects duplicate ownership', async t => {
  const { admin } = await setup(t);
  await admin.assign('alice', 'session1');
  await assert.rejects(admin.assign('bob', 'session1'), /already assigned/);
});
test('enforces maximum sessions even during concurrent requests', async t => {
  const { admin } = await setup(t, 1);
  const results = await Promise.allSettled([admin.assign('alice', 's1'), admin.assign('bob', 's2')]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(admin.list().length, 1);
});
test('revokes only when owner matches', async t => {
  const { admin, ownership } = await setup(t);
  await admin.assign('alice', 's1');
  await assert.rejects(admin.revoke('bob', 's1'), /Access denied/);
  assert.equal(ownership.getOwner('s1'), 'alice');
  await admin.revoke('alice', 's1');
  assert.equal(ownership.getOwner('s1'), null);
});
test('rejects unsafe session identifiers', async t => {
  const { admin } = await setup(t);
  await assert.rejects(admin.assign('alice', '../unsafe'), /Invalid identifier/);
});
