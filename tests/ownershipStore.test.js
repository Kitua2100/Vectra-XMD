import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import OwnershipStore from '../src/core/OwnershipStore.js';

async function fixture(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'vectra-owners-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const filePath = path.join(dir, 'private', 'owners.json');
  const store = await new OwnershipStore({ filePath }).load();
  return { store, filePath };
}

test('persists ownership across restarts', async t => {
  const { store, filePath } = await fixture(t);
  await store.assign('session1', 'alice');
  const restored = await new OwnershipStore({ filePath }).load();
  assert.equal(restored.getOwner('session1'), 'alice');
});

test('rejects duplicate ownership even with concurrent assignments', async t => {
  const { store } = await fixture(t);
  const results = await Promise.allSettled([store.assign('one', 'alice'), store.assign('one', 'bob')]);
  assert.equal(results.filter(x => x.status === 'fulfilled').length, 1);
  assert.equal(store.list().length, 1);
});

test('revokes only for matching owner', async t => {
  const { store } = await fixture(t);
  await store.assign('one', 'alice');
  await assert.rejects(store.revoke('one', 'bob'), /Access denied/);
  assert.equal(store.getOwner('one'), 'alice');
  await store.revoke('one', 'alice');
  assert.equal(store.getOwner('one'), null);
});

test('rejects unsafe identifiers', async t => {
  const { store } = await fixture(t);
  assert.throws(() => store.assign('../escape', 'alice'), /Invalid identifier/);
  assert.throws(() => store.assign('one', 'alice@example.com'), /Invalid identifier/);
});

test('creates private ownership file', async t => {
  const { store, filePath } = await fixture(t);
  await store.assign('one', 'alice');
  const stat = await fs.stat(filePath);
  assert.equal(stat.mode & 0o777, 0o600);
});

test('fails closed on corrupt ownership registry', async t => {
  const { filePath } = await fixture(t);
  await fs.writeFile(filePath, '{bad json');
  await assert.rejects(new OwnershipStore({ filePath }).load(), SyntaxError);
});

test('requires initialization', async () => {
  const store = new OwnershipStore();
  assert.throws(() => store.getOwner('one'), /not initialized/);
});
