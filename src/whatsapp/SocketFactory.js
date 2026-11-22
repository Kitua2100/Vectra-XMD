import {
  makeWASocket,
  Browsers
} from "@whiskeysockets/baileys";

import AuthStore from "./AuthStore.js";

export class SocketFactory {
  constructor({
    authStore = new AuthStore(),
    makeSocket = makeWASocket,
    browser = Browsers.ubuntu("Vectra-XMD"),
    logger = console
  } = {}) {
    this.authStore = authStore;
    this.makeSocket = makeSocket;
    this.browser = browser;
    this.logger = logger;
  }

  async create(sessionId) {
    this.authStore.validateId(sessionId);

    const {
      state,
      saveCreds
    } = await this.authStore.load(sessionId);

    const socket = await this.makeSocket({
      auth: state,
      browser: this.browser,
      printQRInTerminal: false,
      markOnlineOnConnect: false,
      syncFullHistory: false
    });

    if (
      !socket ||
      typeof socket.end !== "function" ||
      typeof socket.ev?.on !== "function"
    ) {
      throw new Error("Socket factory returned an invalid socket");
    }

    socket.ev.on("creds.update", async () => {
      try {
        await saveCreds();
      } catch (error) {
        this.logger.error(
          `Credential save failed for session ${sessionId}`,
          error
        );
      }
    });

    return socket;
  }

  asFactory() {
    return sessionId => this.create(sessionId);
  }
}

export default SocketFactory;
