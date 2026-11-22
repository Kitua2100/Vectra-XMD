import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import UserAuthStore from '../src/core/UserAuthStore.js';

async function fixture(t, now = () => Date.now()) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'vectra-auth-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const filePath = path.join(dir, 'private', 'users.json');
  const store = await new UserAuthStore({ filePath, now }).load();
  return { store, filePath, now };
}
const password = 'StrongPassword!123';
test('trusted provisioning and successful login', async t => {
  const { store } = await fixture(t);
  await store.createUser('alice', password);
  const { token } = await store.login('alice', password);
  assert.equal(store.authenticate(token).userId, 'alice');
});
test('wrong password and missing account have same error', async t => {
  const { store } = await fixture(t);
  await store.createUser('alice', password);
  await assert.rejects(store.login('alice', 'WrongPassword!123'), /Invalid credentials/);
  await assert.rejects(store.login('missing', password), /Invalid credentials/);
});
test('passwords are hashed and bearer tokens are not stored in plaintext', async t => {
  const { store, filePath } = await fixture(t);
  await store.createUser('alice', password);
  const { token } = await store.login('alice', password);
  const raw = await fs.readFile(filePath, 'utf8');
  assert.equal(raw.includes(password), false);
  assert.equal(raw.includes(token), false);
});
test('login survives process restart', async t => {
  const { store, filePath } = await fixture(t);
  await store.createUser('alice', password);
  const { token } = await store.login('alice', password);
  const restarted = await new UserAuthStore({ filePath }).load();
  assert.equal(restarted.authenticate(token).userId, 'alice');
});
test('logout revokes access', async t => {
  const { store } = await fixture(t);
  await store.createUser('alice', password);
  const { token } = await store.login('alice', password);
  await store.logout(token);
  assert.throws(() => store.authenticate(token), /Unauthenticated/);
});
test('tokens expire', async t => {
  let clock = 1000;
  const { store } = await fixture(t, () => clock);
  await store.createUser('alice', password);
  const { token } = await store.login('alice', password);
  clock += 24 * 60 * 60 * 1000;
  assert.throws(() => store.authenticate(token), /Unauthenticated/);
});
test('rejects weak passwords and duplicate users', async t => {
  const { store } = await fixture(t);
  await assert.rejects(store.createUser('alice', 'short'), /Password/);
  await store.createUser('alice', password);
  await assert.rejects(store.createUser('alice', password), /already exists/);
});
test('invalid tokens are rejected', async t => {
  const { store } = await fixture(t);
  assert.throws(() => store.authenticate('bad'), /Unauthenticated/);
});
test('multiple accounts stay isolated', async t => {
  const { store } = await fixture(t);
  await store.createUser('alice', password);
  await store.createUser('bob', 'AnotherStrongPassword!456');
  const a = await store.login('alice', password);
  const b = await store.login('bob', 'AnotherStrongPassword!456');
  assert.equal(store.authenticate(a.token).userId, 'alice');
  assert.equal(store.authenticate(b.token).userId, 'bob');
});
