import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import SessionManager from '../src/core/SessionManager.js';
import SessionAccessController from '../src/core/SessionAccessController.js';

function setup() {
  const sessions = new SessionManager();
  sessions.createSession('s1'); sessions.createSession('s2');
  const sockets = new Map();
  const connectionManager = {
    async connect(id) {
      const ev = new EventEmitter();
      const socket = { ev, authState: { creds: { registered: false } },
        requestPairingCode: async () => '12345678', end: async () => {} };
      sockets.set(id, socket);
      return { sessionId: id, status: 'connecting' };
    },
    getSocket: id => sockets.get(id),
    getStatus: id => sockets.has(id) ? 'connecting' : 'disconnected',
    async disconnect(id) { return sockets.delete(id); }
  };
  const pairingManager = { async requestPairingCode(id, phone, socket) {
    assert.equal(socket, sockets.get(id));
    return { sessionId: id, code: await socket.requestPairingCode(phone) };
  }};
  const access = new SessionAccessController({ sessionManager: sessions, connectionManager, pairingManager });
  access.registerOwner('alice', 's1');
  access.registerOwner('bob', 's2');
  return { access, sockets };
}

test('owner can connect and see status', async () => {
  const { access } = setup();
  await access.connect('alice', 's1');
  assert.equal(access.getStatus('alice', 's1'), 'connecting');
});
test('different user cannot read status or QR', async () => {
  const { access } = setup();
  await access.connect('alice', 's1');
  assert.throws(() => access.getStatus('bob', 's1'), /Access denied/);
  assert.throws(() => access.getQR('bob', 's1'), /Access denied/);
});
test('QR is available only to owner and cleared on open', async () => {
  const { access, sockets } = setup();
  await access.connect('alice', 's1');
  sockets.get('s1').ev.emit('connection.update', { qr: 'secret-qr' });
  assert.equal(access.getQR('alice', 's1'), 'secret-qr');
  sockets.get('s1').ev.emit('connection.update', { connection: 'open' });
  assert.equal(access.getQR('alice', 's1'), null);
});
test('pairing requests require ownership', async () => {
  const { access } = setup();
  await access.connect('alice', 's1');
  await assert.rejects(access.requestPairingCode('bob', 's1', '254712345678'), /Access denied/);
  assert.equal((await access.requestPairingCode('alice', 's1', '254712345678')).code, '12345678');
});
test('QR is cleared and listener detached on disconnect', async () => {
  const { access, sockets } = setup();
  await access.connect('alice', 's1');
  const socket = sockets.get('s1');
  socket.ev.emit('connection.update', { qr: 'secret-qr' });
  await access.disconnect('alice', 's1');
  assert.equal(access.getQR('alice', 's1'), null);
  assert.equal(socket.ev.listenerCount('connection.update'), 0);
});
test('revoked owners lose access', async () => {
  const { access } = setup();
  await access.connect('alice', 's1');
  await access.revoke('alice', 's1');
  assert.throws(() => access.getStatus('alice', 's1'), /Access denied/);
});
test('cannot claim another owner session', () => {
  const { access } = setup();
  assert.throws(() => access.registerOwner('mallory', 's1'), /already assigned/);
});
test('rejects invalid principals', () => {
  const { access } = setup();
  assert.throws(() => access.getQR('../alice', 's1'), /Invalid authenticated principal/);
});
test('two owners have isolated QR secrets', async () => {
  const { access, sockets } = setup();
  await access.connect('alice', 's1'); await access.connect('bob', 's2');
  sockets.get('s1').ev.emit('connection.update', { qr: 'one' });
  sockets.get('s2').ev.emit('connection.update', { qr: 'two' });
  assert.equal(access.getQR('alice', 's1'), 'one');
  assert.equal(access.getQR('bob', 's2'), 'two');
});
