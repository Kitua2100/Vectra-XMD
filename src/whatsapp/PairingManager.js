export class PairingManager {
  constructor({
    sessionManager,
    maxAttempts = 3,
    windowMs = 15 * 60 * 1000,
    pairingTimeoutMs = 2 * 60 * 1000,
    now = () => Date.now()
  } = {}) {
    if (!sessionManager) {
      throw new Error("Session manager is required");
    }

    this.sessionManager = sessionManager;
    this.maxAttempts = maxAttempts;
    this.windowMs = windowMs;
    this.pairingTimeoutMs = pairingTimeoutMs;
    this.now = now;

    this.attempts = new Map();
    this.pending = new Set();
  }

  normalizePhoneNumber(phoneNumber) {
    if (typeof phoneNumber !== "string") {
      throw new Error("Phone number must be a string");
    }

    const normalized = phoneNumber.replace(/[\s()+-]/g, "");

    if (!/^[1-9]\d{7,14}$/.test(normalized)) {
      throw new Error(
        "Invalid phone number. Use international format, e.g. 254712345678"
      );
    }

    return normalized;
  }

  async requestPairingCode(sessionId, phoneNumber, socket) {
    this.sessionManager.validateId(sessionId);

    if (!this.sessionManager.getSession(sessionId)) {
      throw new Error("Session not found");
    }

    if (
      !socket ||
      typeof socket.requestPairingCode !== "function"
    ) {
      throw new Error("Invalid WhatsApp socket");
    }

    if (socket.authState?.creds?.registered) {
      throw new Error("WhatsApp session is already registered");
    }

    const phone = this.normalizePhoneNumber(phoneNumber);

    if (this.pending.has(sessionId)) {
      throw new Error("Pairing request already pending");
    }

    const current = this.now();
    const previous = this.attempts.get(sessionId) || [];

    const recent = previous.filter(
      timestamp => current - timestamp < this.windowMs
    );

    if (recent.length >= this.maxAttempts) {
      throw new Error("Pairing rate limit exceeded");
    }

    recent.push(current);
    this.attempts.set(sessionId, recent);
    this.pending.add(sessionId);

    try {
      const code = await socket.requestPairingCode(phone);

      if (typeof code !== "string" || !code.trim()) {
        throw new Error("WhatsApp returned an invalid pairing code");
      }

      return {
        sessionId,
        code,
        requestedAt: current,
        expiresAt: this.now() + this.pairingTimeoutMs
      };
    } finally {
      this.pending.delete(sessionId);
    }
  }

  clearSession(sessionId) {
    this.sessionManager.validateId(sessionId);
    this.attempts.delete(sessionId);
  }
}

export default PairingManager;
