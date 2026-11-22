import { DisconnectReason } from "@whiskeysockets/baileys";

export class WhatsAppConnectionManager {
  constructor({ sessionManager, socketFactory }) {
    if (!sessionManager || typeof socketFactory !== "function") {
      throw new Error("Session manager and socket factory are required");
    }
    this.sessionManager = sessionManager;
    this.socketFactory = socketFactory;
    this.connections = new Map();
    this.pending = new Map();
    this.listeners = new Map();
    this.closing = new Set();
  }

  async connect(sessionId) {
    this.sessionManager.validateId(sessionId);
    if (!this.sessionManager.getSession(sessionId)) throw new Error("Session not found");
    if (this.connections.has(sessionId) || this.pending.has(sessionId) || this.closing.has(sessionId)) {
      throw new Error("Session is already connecting or connected");
    }
    const operation = this.createConnection(sessionId);
    this.pending.set(sessionId, operation);
    try {
      return await operation;
    } finally {
      if (this.pending.get(sessionId) === operation) this.pending.delete(sessionId);
    }
  }

  async createConnection(sessionId) {
    this.sessionManager.updateStatus(sessionId, "connecting");
    try {
      const socket = await this.socketFactory(sessionId);
      if (!socket || typeof socket.end !== "function" || typeof socket.ev?.on !== "function") {
        throw new Error("Invalid socket returned by factory");
      }
      this.connections.set(sessionId, socket);
      const onUpdate = update => {
        if (this.connections.get(sessionId) !== socket || this.closing.has(sessionId)) return;
        if (!this.sessionManager.getSession(sessionId)) return;
        if (update.connection === "open") {
          this.sessionManager.updateStatus(sessionId, "connected");
        } else if (update.connection === "close") {
          const code = update.lastDisconnect?.error?.output?.statusCode;
          this.detach(sessionId, socket);
          this.connections.delete(sessionId);
          this.sessionManager.updateStatus(
            sessionId,
            code === DisconnectReason.loggedOut ? "logged_out" : "disconnected"
          );
          // Reconnection is deliberately delegated to a future supervisor.
        }
      };
      socket.ev.on("connection.update", onUpdate);
      this.listeners.set(sessionId, { socket, onUpdate });
      return { sessionId, status: this.sessionManager.getSession(sessionId)?.status ?? "connecting" };
    } catch (error) {
      if (this.sessionManager.getSession(sessionId)) this.sessionManager.updateStatus(sessionId, "error");
      throw error;
    }
  }

  detach(sessionId, socket) {
    const listener = this.listeners.get(sessionId);
    if (listener?.socket !== socket) return;
    if (typeof socket.ev?.off === "function") socket.ev.off("connection.update", listener.onUpdate);
    else if (typeof socket.ev?.removeListener === "function") {
      socket.ev.removeListener("connection.update", listener.onUpdate);
    }
    this.listeners.delete(sessionId);
  }

  async disconnect(sessionId) {
    this.sessionManager.validateId(sessionId);
    if (this.closing.has(sessionId)) return false;
    this.closing.add(sessionId);
    try {
      const pending = this.pending.get(sessionId);
      if (pending) { try { await pending; } catch { /* no socket created */ } }
      const socket = this.connections.get(sessionId);
      if (!socket) {
        if (this.sessionManager.getSession(sessionId)) this.sessionManager.updateStatus(sessionId, "disconnected");
        return false;
      }
      this.detach(sessionId, socket);
      try {
        await socket.end();
      } catch (error) {
        // Keep the socket tracked so shutdown can be retried.
        this.connections.set(sessionId, socket);
        throw error;
      }
      if (this.connections.get(sessionId) === socket) this.connections.delete(sessionId);
      if (this.sessionManager.getSession(sessionId)) this.sessionManager.updateStatus(sessionId, "disconnected");
      return true;
    } finally {
      this.closing.delete(sessionId);
    }
  }

  getSocket(sessionId) {
    this.sessionManager.validateId(sessionId);
    return this.connections.get(sessionId) ?? null;
  }

  getStatus(sessionId) {
    return this.sessionManager.getSession(sessionId)?.status ?? null;
  }

  async shutdown() {
    const ids = new Set([...this.connections.keys(), ...this.pending.keys()]);
    const results = await Promise.allSettled([...ids].map(id => this.disconnect(id)));
    const failures = results.filter(result => result.status === "rejected");
    if (failures.length) {
      throw new AggregateError(failures.map(result => result.reason), "Some connections failed to close");
    }
  }
}

export default WhatsAppConnectionManager;
