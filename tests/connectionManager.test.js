import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import SessionManager from "../src/core/SessionManager.js";
import WhatsAppConnectionManager from "../src/core/WhatsAppConnectionManager.js";

function setup(maxSessions = 3) {
  const sessionManager = new SessionManager({ maxSessions });
  const closed = [];
  const sockets = new Map();
  const connectionManager = new WhatsAppConnectionManager({
    sessionManager,
    socketFactory: async id => {
      const socket = { ev: new EventEmitter(), async end() { closed.push(id); } };
      sockets.set(id, socket);
      return socket;
    }
  });
  return { sessionManager, connectionManager, closed, sockets };
}

test("socket creation leaves session connecting until open event", async () => {
  const { sessionManager, connectionManager, sockets } = setup();
  sessionManager.createSession("user1");
  assert.deepEqual(await connectionManager.connect("user1"), { sessionId: "user1", status: "connecting" });
  assert.equal(connectionManager.getStatus("user1"), "connecting");
  sockets.get("user1").ev.emit("connection.update", { connection: "open" });
  assert.equal(connectionManager.getStatus("user1"), "connected");
});

test("supports independent connections", async () => {
  const { sessionManager, connectionManager, sockets } = setup();
  sessionManager.createSession("user1"); sessionManager.createSession("user2");
  await connectionManager.connect("user1"); await connectionManager.connect("user2");
  sockets.get("user1").ev.emit("connection.update", { connection: "open" });
  assert.equal(connectionManager.getStatus("user1"), "connected");
  assert.equal(connectionManager.getStatus("user2"), "connecting");
});

test("prevents duplicate connections", async () => {
  const { sessionManager, connectionManager } = setup();
  sessionManager.createSession("user1");
  await connectionManager.connect("user1");
  await assert.rejects(connectionManager.connect("user1"), /already connecting or connected/);
});

test("disconnects a session", async () => {
  const { sessionManager, connectionManager, closed } = setup();
  sessionManager.createSession("user1");
  await connectionManager.connect("user1");
  assert.equal(await connectionManager.disconnect("user1"), true);
  assert.equal(connectionManager.getStatus("user1"), "disconnected");
  assert.deepEqual(closed, ["user1"]);
});

test("rejects unknown sessions", async () => {
  const { connectionManager } = setup();
  await assert.rejects(connectionManager.connect("unknown"), /Session not found/);
});

test("handles connection failures", async () => {
  const sessionManager = new SessionManager(); sessionManager.createSession("user1");
  const connectionManager = new WhatsAppConnectionManager({ sessionManager, socketFactory: async () => { throw new Error("Connection failed"); } });
  await assert.rejects(connectionManager.connect("user1"), /Connection failed/);
  assert.equal(connectionManager.getStatus("user1"), "error");
});

test("shuts down all connections", async () => {
  const { sessionManager, connectionManager, closed } = setup();
  sessionManager.createSession("user1"); sessionManager.createSession("user2");
  await connectionManager.connect("user1"); await connectionManager.connect("user2");
  await connectionManager.shutdown();
  assert.equal(connectionManager.getStatus("user1"), "disconnected");
  assert.equal(connectionManager.getStatus("user2"), "disconnected");
  assert.deepEqual(closed.sort(), ["user1", "user2"]);
});

test("close event removes socket and allows manual reconnect", async () => {
  const { sessionManager, connectionManager, sockets } = setup();
  sessionManager.createSession("user1");
  await connectionManager.connect("user1");
  const old = sockets.get("user1");
  old.ev.emit("connection.update", { connection: "close" });
  assert.equal(connectionManager.getStatus("user1"), "disconnected");
  assert.equal(connectionManager.getSocket("user1"), null);
  await connectionManager.connect("user1");
  old.ev.emit("connection.update", { connection: "open" });
  assert.equal(connectionManager.getStatus("user1"), "connecting");
  sockets.get("user1").ev.emit("connection.update", { connection: "open" });
  assert.equal(connectionManager.getStatus("user1"), "connected");
});

test("logged-out close sets logged_out without deleting credentials", async () => {
  const { sessionManager, connectionManager, sockets } = setup();
  sessionManager.createSession("user1");
  await connectionManager.connect("user1");
  sockets.get("user1").ev.emit("connection.update", {
    connection: "close", lastDisconnect: { error: { output: { statusCode: 401 } } }
  });
  assert.equal(connectionManager.getStatus("user1"), "logged_out");
});

test("manual disconnect ignores late socket events", async () => {
  const { sessionManager, connectionManager, sockets } = setup();
  sessionManager.createSession("user1");
  await connectionManager.connect("user1");
  const socket = sockets.get("user1");
  await connectionManager.disconnect("user1");
  socket.ev.emit("connection.update", { connection: "open" });
  assert.equal(connectionManager.getStatus("user1"), "disconnected");
});

test("invalid socket reports error", async () => {
  const sessionManager = new SessionManager(); sessionManager.createSession("user1");
  const connectionManager = new WhatsAppConnectionManager({ sessionManager, socketFactory: async () => ({ end() {} }) });
  await assert.rejects(connectionManager.connect("user1"), /Invalid socket/);
  assert.equal(connectionManager.getStatus("user1"), "error");
});
