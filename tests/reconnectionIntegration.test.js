import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import OwnershipStore from '../src/core/OwnershipStore.js';
import UserAuthStore from '../src/core/UserAuthStore.js';
import createMultiUserApp from '../src/app/createMultiUserApp.js';

test('API connection supervision reattaches QR on reconnect and stops on manual disconnect', async t => {
  const privateDir = await mkdtemp(path.join(tmpdir(), 'vectra-integration-'));
  let app;
  t.after(async () => { if (app) await app.shutdown(); await rm(privateDir, {recursive:true, force:true}); });
  const store = await new OwnershipStore({filePath:path.join(privateDir,'session-owners.json')}).load();
  await store.assign('alice_phone','alice');
  const sockets = [];
  app = await createMultiUserApp({ privateDir, socketFactory: async () => {
    const socket = {ev:new EventEmitter(), end: async()=>{}};
    sockets.push(socket); return socket;
  }});
  const c = app.accessController;
  await c.connect('alice','alice_phone');
  assert.equal(app.reconnectionSupervisor.active.has('alice_phone'), true);
  sockets[0].ev.emit('connection.update', {qr:'first'});
  assert.equal(c.getQR('alice','alice_phone'),'first');
  app.reconnectionSupervisor.baseDelayMs = 1;
  sockets[0].ev.emit('connection.update', {connection:'close'});
  assert.equal(c.getQR('alice','alice_phone'),null);
  assert.equal(c.getStatus('alice','alice_phone'),'reconnecting');
  // Use real timer with short delay by configuring supervisor after construction.
  await new Promise(resolve => setTimeout(resolve, 1400));
  assert.equal(sockets.length,2);
  sockets[1].ev.emit('connection.update',{qr:'second'});
  assert.equal(c.getQR('alice','alice_phone'),'second');
  await c.disconnect('alice','alice_phone');
  assert.equal(app.reconnectionSupervisor.active.size,0);
  assert.equal(c.getQR('alice','alice_phone'),null);
});
