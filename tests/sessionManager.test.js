import test from "node:test";
import assert from "node:assert/strict";

import SessionManager from "../src/core/SessionManager.js";

test("creates independent sessions", () => {
  const manager = new SessionManager();

  manager.createSession("user1");
  manager.createSession("user2");

  assert.equal(manager.listSessions().length, 2);

  assert.equal(
    manager.getSession("user1").status,
    "disconnected"
  );
});

test("updates connection status", () => {
  const manager = new SessionManager();

  manager.createSession("user1");
  manager.updateStatus("user1", "connected");

  assert.equal(
    manager.getSession("user1").status,
    "connected"
  );
});

test("prevents duplicate sessions", () => {
  const manager = new SessionManager();

  manager.createSession("user1");

  assert.throws(() => {
    manager.createSession("user1");
  });
});

test("enforces session limits", () => {
  const manager = new SessionManager({
    maxSessions: 2
  });

  manager.createSession("user1");
  manager.createSession("user2");

  assert.throws(() => {
    manager.createSession("user3");
  });
});

test("removes sessions", () => {
  const manager = new SessionManager();

  manager.createSession("user1");
  manager.removeSession("user1");

  assert.equal(manager.getSession("user1"), null);
});

test("rejects unsafe identifiers", () => {
  const manager = new SessionManager();

  assert.throws(() => {
    manager.createSession("../other-user");
  });
});

test("does not expose mutable session objects", () => {
  const manager = new SessionManager();

  manager.createSession("user1");

  const session = manager.getSession("user1");
  session.status = "connected";

  assert.equal(
    manager.getSession("user1").status,
    "disconnected"
  );
});
