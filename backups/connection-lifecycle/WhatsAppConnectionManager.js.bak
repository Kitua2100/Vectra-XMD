export class WhatsAppConnectionManager {
  constructor({ sessionManager, socketFactory }) {
    if (!sessionManager || typeof socketFactory !== "function") {
      throw new Error("Session manager and socket factory are required");
    }

    this.sessionManager = sessionManager;
    this.socketFactory = socketFactory;
    this.connections = new Map();
    this.pending = new Map();
  }

  async connect(sessionId) {
    this.sessionManager.validateId(sessionId);

    if (!this.sessionManager.getSession(sessionId)) {
      throw new Error("Session not found");
    }

    if (this.connections.has(sessionId) || this.pending.has(sessionId)) {
      throw new Error("Session is already connecting or connected");
    }

    const operation = this.createConnection(sessionId);
    this.pending.set(sessionId, operation);

    try {
      return await operation;
    } finally {
      if (this.pending.get(sessionId) === operation) {
        this.pending.delete(sessionId);
      }
    }
  }

  async createConnection(sessionId) {
    this.sessionManager.updateStatus(sessionId, "connecting");

    try {
      const socket = await this.socketFactory(sessionId);

      if (!socket || typeof socket.end !== "function") {
        throw new Error("Invalid socket returned by factory");
      }

      this.connections.set(sessionId, socket);
      this.sessionManager.updateStatus(sessionId, "connected");

      return {
        sessionId,
        status: "connected"
      };
    } catch (error) {
      this.sessionManager.updateStatus(sessionId, "error");
      throw error;
    }
  }

  async disconnect(sessionId) {
    this.sessionManager.validateId(sessionId);

    const pending = this.pending.get(sessionId);

    if (pending) {
      try {
        await pending;
      } catch {
        // A failed connection requires no socket shutdown.
      }
    }

    const socket = this.connections.get(sessionId);

    if (!socket) {
      if (this.sessionManager.getSession(sessionId)) {
        this.sessionManager.updateStatus(sessionId, "disconnected");
      }
      return false;
    }

    await socket.end();

    this.connections.delete(sessionId);

    if (this.sessionManager.getSession(sessionId)) {
      this.sessionManager.updateStatus(sessionId, "disconnected");
    }

    return true;
  }

  getStatus(sessionId) {
    return this.sessionManager.getSession(sessionId)?.status ?? null;
  }

  async shutdown() {
    const ids = new Set([
      ...this.connections.keys(),
      ...this.pending.keys()
    ]);

    const results = await Promise.allSettled(
      [...ids].map(id => this.disconnect(id))
    );

    const failures = results.filter(
      result => result.status === "rejected"
    );

    if (failures.length) {
      throw new AggregateError(
        failures.map(result => result.reason),
        "Some connections failed to close"
      );
    }
  }
}

export default WhatsAppConnectionManager;
