import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";

import SocketFactory from "../src/whatsapp/SocketFactory.js";

function createEnvironment() {
  const events = new EventEmitter();

  let saved = 0;
  let receivedConfig;

  const authStore = {
    validateId(id) {
      if (!/^[a-zA-Z0-9_-]{1,64}$/.test(id)) {
        throw new Error("Invalid session identifier");
      }
    },

    async load(id) {
      this.validateId(id);

      return {
        state: {
          creds: {
            registered: false
          },
          keys: {}
        },

        saveCreds: async () => {
          saved++;
        }
      };
    }
  };

  const makeSocket = async config => {
    receivedConfig = config;

    return {
      ev: events,
      end: async () => {}
    };
  };

  const factory = new SocketFactory({
    authStore,
    makeSocket,
    browser: ["Vectra-XMD", "Chrome", "1.0"],
    logger: {
      error() {}
    }
  });

  return {
    factory,
    events,
    getSaved: () => saved,
    getConfig: () => receivedConfig
  };
}

test("creates a WhatsApp socket", async () => {
  const env = createEnvironment();

  const socket = await env.factory.create("user1");

  assert.equal(typeof socket.end, "function");
});

test("loads authentication state", async () => {
  const env = createEnvironment();

  await env.factory.create("user1");

  assert.equal(
    env.getConfig().auth.creds.registered,
    false
  );
});

test("disables automatic QR printing", async () => {
  const env = createEnvironment();

  await env.factory.create("user1");

  assert.equal(
    env.getConfig().printQRInTerminal,
    false
  );
});

test("saves credentials when updated", async () => {
  const env = createEnvironment();

  await env.factory.create("user1");

  env.events.emit("creds.update");

  await new Promise(resolve => setImmediate(resolve));

  assert.equal(env.getSaved(), 1);
});

test("rejects unsafe session identifiers", async () => {
  const env = createEnvironment();

  await assert.rejects(
    env.factory.create("../unsafe"),
    /Invalid session identifier/
  );
});

test("rejects invalid sockets", async () => {
  const env = createEnvironment();

  env.factory.makeSocket = async () => ({});

  await assert.rejects(
    env.factory.create("user1"),
    /invalid socket/
  );
});

test("provides a compatible socket factory function", async () => {
  const env = createEnvironment();

  const createSocket = env.factory.asFactory();

  const socket = await createSocket("user1");

  assert.equal(typeof socket.end, "function");
});
