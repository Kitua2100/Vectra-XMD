import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import SessionManager from '../src/core/SessionManager.js';
import WhatsAppConnectionManager from '../src/core/WhatsAppConnectionManager.js';
import ReconnectionSupervisor from '../src/core/ReconnectionSupervisor.js';

function setup(options = {}) {
  const sessions = new SessionManager();
  sessions.createSession('one');
  sessions.createSession('two');
  const sockets = new Map();
  const timers = new Map();
  let next = 0;
  const manager = new WhatsAppConnectionManager({ sessionManager: sessions, socketFactory: async id => {
    const socket = { ev: new EventEmitter(), async end() {} };
    sockets.set(id, socket);
    return socket;
  }});
  const supervisor = new ReconnectionSupervisor({ connectionManager: manager,
    setTimer: (fn, ms) => { const id = ++next; timers.set(id, { fn, ms }); return id; },
    clearTimer: id => timers.delete(id), random: () => 0.5,
    logger: { warn() {} }, ...options });
  async function tick() {
    const [id, timer] = timers.entries().next().value;
    timers.delete(id);
    timer.fn();
    await new Promise(resolve => setImmediate(resolve));
  }
  return { sessions, sockets, timers, manager, supervisor, tick };
}

test('unexpected close schedules reconnect and reuses the same session', async () => {
  const x = setup();
  await x.supervisor.start('one');
  const first = x.sockets.get('one');
  first.ev.emit('connection.update', { connection: 'close' });
  assert.equal(x.manager.getStatus('one'), 'reconnecting');
  assert.equal(x.timers.size, 1);
  await x.tick();
  assert.notEqual(x.sockets.get('one'), first);
  assert.equal(x.manager.getStatus('one'), 'connecting');
  await x.supervisor.shutdown();
});

test('logged out never reconnects', async () => {
  const x = setup();
  await x.supervisor.start('one');
  x.sockets.get('one').ev.emit('connection.update', { connection: 'close', lastDisconnect: { error: { output: { statusCode: 401 } } } });
  assert.equal(x.manager.getStatus('one'), 'logged_out');
  assert.equal(x.timers.size, 0);
  await x.supervisor.stop('one');
});

test('stop cancels scheduled reconnect', async () => {
  const x = setup();
  await x.supervisor.start('one');
  x.sockets.get('one').ev.emit('connection.update', { connection: 'close' });
  await x.supervisor.stop('one');
  assert.equal(x.timers.size, 0);
  assert.equal(x.manager.getStatus('one'), 'disconnected');
});

test('backoff increases and stops at attempt limit', async () => {
  const x = setup({ baseDelayMs: 100, maxDelayMs: 1000, maxAttempts: 2 });
  await x.supervisor.start('one');
  x.sockets.get('one').ev.emit('connection.update', { connection: 'close' });
  assert.equal([...x.timers.values()][0].ms, 100);
  await x.tick();
  x.sockets.get('one').ev.emit('connection.update', { connection: 'close' });
  assert.equal([...x.timers.values()][0].ms, 200);
  await x.tick();
  x.sockets.get('one').ev.emit('connection.update', { connection: 'close' });
  assert.equal(x.timers.size, 0);
  assert.equal(x.manager.getStatus('one'), 'error');
  await x.supervisor.stop('one');
});

test('open resets retry count and sessions are independent', async () => {
  const x = setup({ baseDelayMs: 100, maxAttempts: 2 });
  await x.supervisor.start('one');
  await x.supervisor.start('two');
  x.sockets.get('one').ev.emit('connection.update', { connection: 'close' });
  assert.equal(x.manager.getStatus('two'), 'connecting');
  await x.tick();
  x.sockets.get('one').ev.emit('connection.update', { connection: 'open' });
  x.sockets.get('one').ev.emit('connection.update', { connection: 'close' });
  assert.equal([...x.timers.values()][0].ms, 100);
  await x.supervisor.shutdown();
});
