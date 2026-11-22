import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, stat, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import AuditLog from '../src/core/AuditLog.js';

test('audit entries are serialized and contain only allowlisted fields', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'vectra-audit-'));
  try {
    const filePath = path.join(dir, 'audit.jsonl');
    const audit = new AuditLog({ filePath, now: () => '2026-11-22T00:00:00Z' });
    await Promise.all([audit.record('login_success', { userId: 'alice', token: 'secret' }), audit.record('session_connect', { userId: 'alice', sessionId: 's1', qr: 'secret' })]);
    const lines = (await readFile(filePath, 'utf8')).trim().split('\n').map(JSON.parse);
    assert.equal(lines.length, 2);
    assert.deepEqual(lines[0], { at: '2026-11-22T00:00:00Z', event: 'login_success', userId: 'alice' });
    assert.equal(lines[1].sessionId, 's1');
    assert.equal((await stat(filePath)).mode & 0o777, 0o600);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test('rejects unsupported events and unsafe identifiers', async () => {
  const audit = new AuditLog();
  assert.throws(() => audit.record('password_changed'), /Unsupported/);
  assert.throws(() => audit.record('logout', { userId: '../escape' }), /Invalid/);
});
