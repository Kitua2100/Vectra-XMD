import test from "node:test";
import assert from "node:assert/strict";

import SessionManager from "../src/core/SessionManager.js";
import WhatsAppConnectionManager from "../src/core/WhatsAppConnectionManager.js";

function setup(maxSessions = 3) {
  const sessionManager = new SessionManager({ maxSessions });
  const closed = [];

  const connectionManager = new WhatsAppConnectionManager({
    sessionManager,
    socketFactory: async id => ({
      async end() {
        closed.push(id);
      }
    })
  });

  return { sessionManager, connectionManager, closed };
}

test("connects a session", async () => {
  const { sessionManager, connectionManager } = setup();

  sessionManager.createSession("user1");

  await connectionManager.connect("user1");

  assert.equal(connectionManager.getStatus("user1"), "connected");
});

test("supports independent connections", async () => {
  const { sessionManager, connectionManager } = setup();

  sessionManager.createSession("user1");
  sessionManager.createSession("user2");

  await connectionManager.connect("user1");
  await connectionManager.connect("user2");

  assert.equal(connectionManager.getStatus("user1"), "connected");
  assert.equal(connectionManager.getStatus("user2"), "connected");
});

test("prevents duplicate connections", async () => {
  const { sessionManager, connectionManager } = setup();

  sessionManager.createSession("user1");

  await connectionManager.connect("user1");

  await assert.rejects(
    connectionManager.connect("user1"),
    /already connecting or connected/
  );
});

test("disconnects a session", async () => {
  const { sessionManager, connectionManager, closed } = setup();

  sessionManager.createSession("user1");

  await connectionManager.connect("user1");
  await connectionManager.disconnect("user1");

  assert.equal(connectionManager.getStatus("user1"), "disconnected");
  assert.deepEqual(closed, ["user1"]);
});

test("rejects unknown sessions", async () => {
  const { connectionManager } = setup();

  await assert.rejects(
    connectionManager.connect("unknown"),
    /Session not found/
  );
});

test("handles connection failures", async () => {
  const sessionManager = new SessionManager();
  sessionManager.createSession("user1");

  const connectionManager = new WhatsAppConnectionManager({
    sessionManager,
    socketFactory: async () => {
      throw new Error("Connection failed");
    }
  });

  await assert.rejects(
    connectionManager.connect("user1"),
    /Connection failed/
  );

  assert.equal(connectionManager.getStatus("user1"), "error");
});

test("shuts down all connections", async () => {
  const { sessionManager, connectionManager, closed } = setup();

  sessionManager.createSession("user1");
  sessionManager.createSession("user2");

  await connectionManager.connect("user1");
  await connectionManager.connect("user2");

  await connectionManager.shutdown();

  assert.equal(connectionManager.getStatus("user1"), "disconnected");
  assert.equal(connectionManager.getStatus("user2"), "disconnected");
  assert.deepEqual(closed.sort(), ["user1", "user2"]);
});
