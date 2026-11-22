import test from "node:test";
import assert from "node:assert/strict";

import PairingManager from "../src/whatsapp/PairingManager.js";

function createSessionManager() {
  return {
    validateId(id) {
      if (!/^[a-zA-Z0-9_-]{1,64}$/.test(id)) {
        throw new Error("Invalid session identifier");
      }
    },
    getSession(id) {
      return id === "user1" || id === "user2"
        ? { id }
        : null;
    }
  };
}

function createManager(options = {}) {
  return new PairingManager({
    sessionManager: createSessionManager(),
    ...options
  });
}

test("validates international phone numbers", () => {
  const manager = createManager();

  assert.equal(
    manager.normalizePhoneNumber("+254 712 345 678"),
    "254712345678"
  );

  assert.throws(
    () => manager.normalizePhoneNumber("0712345678"),
    /Invalid phone number/
  );
});

test("requests a pairing code", async () => {
  const manager = createManager();

  const socket = {
    requestPairingCode: async phone => {
      assert.equal(phone, "254712345678");
      return "ABCD1234";
    }
  };

  const result = await manager.requestPairingCode(
    "user1",
    "+254712345678",
    socket
  );

  assert.equal(result.code, "ABCD1234");
  assert.equal(result.sessionId, "user1");
  assert.ok(result.expiresAt > Date.now());
});

test("rejects unknown sessions", async () => {
  const manager = createManager();

  await assert.rejects(
    manager.requestPairingCode("unknown", "254712345678", {
      requestPairingCode: async () => "ABCD1234"
    }),
    /Session not found/
  );
});

test("rejects registered WhatsApp sessions", async () => {
  const manager = createManager();

  await assert.rejects(
    manager.requestPairingCode("user1", "254712345678", {
      authState: { creds: { registered: true } },
      requestPairingCode: async () => "ABCD1234"
    }),
    /already registered/
  );
});

test("prevents duplicate pending requests", async () => {
  const manager = createManager();

  let resolveRequest;

  const socket = {
    requestPairingCode: () => new Promise(resolve => {
      resolveRequest = resolve;
    })
  };

  const first = manager.requestPairingCode(
    "user1",
    "254712345678",
    socket
  );

  await assert.rejects(
    manager.requestPairingCode(
      "user1",
      "254712345678",
      socket
    ),
    /already pending/
  );

  resolveRequest("ABCD1234");
  await first;
});

test("enforces pairing rate limits", async () => {
  const manager = createManager({
    maxAttempts: 2
  });

  const socket = {
    requestPairingCode: async () => "ABCD1234"
  };

  await manager.requestPairingCode(
    "user1", "254712345678", socket
  );

  await manager.requestPairingCode(
    "user1", "254712345678", socket
  );

  await assert.rejects(
    manager.requestPairingCode(
      "user1", "254712345678", socket
    ),
    /rate limit exceeded/
  );
});

test("keeps session rate limits independent", async () => {
  const manager = createManager({
    maxAttempts: 1
  });

  const socket = {
    requestPairingCode: async () => "ABCD1234"
  };

  await manager.requestPairingCode(
    "user1", "254712345678", socket
  );

  const result = await manager.requestPairingCode(
    "user2", "254712345678", socket
  );

  assert.equal(result.sessionId, "user2");
});

test("clears session rate-limit state", async () => {
  const manager = createManager({
    maxAttempts: 1
  });

  const socket = {
    requestPairingCode: async () => "ABCD1234"
  };

  await manager.requestPairingCode(
    "user1", "254712345678", socket
  );

  manager.clearSession("user1");

  const result = await manager.requestPairingCode(
    "user1", "254712345678", socket
  );

  assert.equal(result.code, "ABCD1234");
});
