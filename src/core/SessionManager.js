export class SessionManager {
  constructor({ maxSessions = 3 } = {}) {
    if (!Number.isInteger(maxSessions) || maxSessions < 1) {
      throw new Error("maxSessions must be a positive integer");
    }

    this.sessions = new Map();
    this.maxSessions = maxSessions;
  }

  validateId(sessionId) {
    if (
      typeof sessionId !== "string" ||
      !/^[a-zA-Z0-9_-]{1,64}$/.test(sessionId)
    ) {
      throw new Error("Invalid session identifier");
    }
  }

  createSession(sessionId) {
    this.validateId(sessionId);

    if (this.sessions.has(sessionId)) {
      throw new Error("Session already exists");
    }

    if (this.sessions.size >= this.maxSessions) {
      throw new Error("Maximum session limit reached");
    }

    const session = {
      id: sessionId,
      status: "disconnected",
      reconnectAttempts: 0,
      createdAt: new Date().toISOString()
    };

    this.sessions.set(sessionId, session);

    return { ...session };
  }

  getSession(sessionId) {
    this.validateId(sessionId);

    const session = this.sessions.get(sessionId);

    return session ? { ...session } : null;
  }

  updateStatus(sessionId, status) {
    this.validateId(sessionId);

    const allowedStatuses = [
      "disconnected",
      "connecting",
      "connected",
      "reconnecting",
      "logged_out",
      "error"
    ];

    if (!allowedStatuses.includes(status)) {
      throw new Error("Invalid session status");
    }

    const session = this.sessions.get(sessionId);

    if (!session) {
      throw new Error("Session not found");
    }

    session.status = status;

    if (status === "connected") {
      session.reconnectAttempts = 0;
    }

    return { ...session };
  }

  removeSession(sessionId) {
    this.validateId(sessionId);
    return this.sessions.delete(sessionId);
  }

  listSessions() {
    return Array.from(
      this.sessions.values(),
      session => ({ ...session })
    );
  }

  getStats() {
    const sessions = this.listSessions();

    return {
      total: sessions.length,
      connected: sessions.filter(
        session => session.status === "connected"
      ).length,
      disconnected: sessions.filter(
        session => session.status === "disconnected"
      ).length,
      maxSessions: this.maxSessions
    };
  }
}

export default SessionManager;
