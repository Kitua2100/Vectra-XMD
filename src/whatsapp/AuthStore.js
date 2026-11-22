import fs from "node:fs/promises";
import path from "node:path";

import {
  useMultiFileAuthState
} from "@whiskeysockets/baileys";

export class AuthStore {
  constructor({
    baseDir = path.resolve("auth")
  } = {}) {
    this.baseDir = baseDir;
  }

  validateId(sessionId) {
    if (
      typeof sessionId !== "string" ||
      !/^[a-zA-Z0-9_-]{1,64}$/.test(sessionId)
    ) {
      throw new Error("Invalid session identifier");
    }
  }

  getSessionPath(sessionId) {
    this.validateId(sessionId);

    return path.join(
      this.baseDir,
      sessionId
    );
  }

  async load(sessionId) {
    const sessionPath =
      this.getSessionPath(sessionId);

    await fs.mkdir(sessionPath, {
      recursive: true,
      mode: 0o700
    });

    await fs.chmod(sessionPath, 0o700);

    const {
      state,
      saveCreds
    } = await useMultiFileAuthState(
      sessionPath
    );

    return {
      state,
      saveCreds,
      sessionPath
    };
  }
}

export default AuthStore;
