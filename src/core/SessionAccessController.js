/**
 * Authorization boundary for modular sessions.
 * The caller must supply a trusted, authenticated principal ID; never use
 * a user ID directly from an unauthenticated request body.
 * When ownershipStore is supplied, ownership is read from persistent storage.
 * Provision ownership only through trusted server-side code.
 */
export class SessionAccessController {
  constructor({ sessionManager, connectionManager, pairingManager, ownershipStore = null, reconnectionSupervisor = null } = {}) {
    if (!sessionManager || !connectionManager || !pairingManager) {
      throw new Error('Session, connection and pairing managers are required');
    }
    this.sessions = sessionManager;
    this.connections = connectionManager;
    this.pairing = pairingManager;
    if (ownershipStore && !ownershipStore.loaded) throw new Error('Ownership store not initialized');
    this.ownershipStore = ownershipStore;
    this.reconnectionSupervisor = reconnectionSupervisor;
    this.owners = ownershipStore ? null : new Map();
    this.qr = new Map();
    this.listeners = new Map();
  }

  validatePrincipal(principalId) {
    if (typeof principalId !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(principalId)) {
      throw new Error('Invalid authenticated principal');
    }
  }

  /** Initialize persistent access from an already-loaded store. Sessions are
   * registered only from trusted persisted records, never client input. */
  static async fromOwnershipStore({ ownershipStore, sessionManager, connectionManager, pairingManager, reconnectionSupervisor = null }) {
    if (!ownershipStore) throw new Error('Ownership store is required');
    if (!ownershipStore.loaded) await ownershipStore.load();
    for (const { sessionId } of ownershipStore.list()) {
      if (!sessionManager.getSession(sessionId)) sessionManager.createSession(sessionId);
    }
    return new SessionAccessController({
      sessionManager, connectionManager, pairingManager, ownershipStore, reconnectionSupervisor
    });
  }

  /** Trusted provisioning; never expose this operation to an HTTP client. */
  async provisionOwner(principalId, sessionId) {
    if (!this.ownershipStore) throw new Error('Persistent ownership store required');
    this.validatePrincipal(principalId);
    this.sessions.validateId(sessionId);
    if (!this.sessions.getSession(sessionId)) throw new Error('Session not found');
    return this.ownershipStore.assign(sessionId, principalId);
  }

  registerOwner(principalId, sessionId) {
    if (this.ownershipStore) throw new Error('Use trusted async provisionOwner');
    this.validatePrincipal(principalId);
    this.sessions.validateId(sessionId);
    if (!this.sessions.getSession(sessionId)) throw new Error('Session not found');
    if (this.owners.has(sessionId)) throw new Error('Session owner already assigned');
    this.owners.set(sessionId, principalId);
  }

  authorize(principalId, sessionId) {
    this.validatePrincipal(principalId);
    this.sessions.validateId(sessionId);
    const owner = this.ownershipStore ? this.ownershipStore.getOwner(sessionId) : this.owners.get(sessionId);
    if (owner !== principalId || !this.sessions.getSession(sessionId)) {
      throw new Error('Access denied');
    }
  }

  async connect(principalId, sessionId) {
    this.authorize(principalId, sessionId);
    if (this.reconnectionSupervisor) {
      await this.reconnectionSupervisor.start(sessionId);
      return { sessionId, status: this.connections.getStatus(sessionId) };
    }
    const result = await this.connections.connect(sessionId);
    this.trackQR(sessionId, this.connections.getSocket(sessionId));
    return result;
  }

  trackQR(sessionId, socket) {
    this.detachQR(sessionId);
    if (!socket?.ev?.on) return;
    const onUpdate = update => {
      if (update.connection === 'close') { this.qr.delete(sessionId); return; }
      if (this.connections.getSocket(sessionId) !== socket) return;
      if (typeof update.qr === 'string' && update.qr) this.qr.set(sessionId, update.qr);
      if (update.connection === 'open' || update.connection === 'close') this.qr.delete(sessionId);
    };
    socket.ev.on('connection.update', onUpdate);
    this.listeners.set(sessionId, { socket, onUpdate });
  }

  detachQR(sessionId) {
    const previous = this.listeners.get(sessionId);
    if (previous) {
      const { socket, onUpdate } = previous;
      if (typeof socket.ev?.off === 'function') socket.ev.off('connection.update', onUpdate);
      else socket.ev?.removeListener?.('connection.update', onUpdate);
    }
    this.listeners.delete(sessionId);
    this.qr.delete(sessionId);
  }

  getQR(principalId, sessionId) {
    this.authorize(principalId, sessionId);
    return this.qr.get(sessionId) ?? null;
  }

  async requestPairingCode(principalId, sessionId, phoneNumber) {
    this.authorize(principalId, sessionId);
    const socket = this.connections.getSocket(sessionId);
    if (!socket) throw new Error('Session is not connecting');
    return this.pairing.requestPairingCode(sessionId, phoneNumber, socket);
  }

  getStatus(principalId, sessionId) {
    this.authorize(principalId, sessionId);
    return this.connections.getStatus(sessionId);
  }

  async disconnect(principalId, sessionId) {
    this.authorize(principalId, sessionId);
    const result = this.reconnectionSupervisor && this.reconnectionSupervisor.active.has(sessionId)
      ? await this.reconnectionSupervisor.stop(sessionId)
      : await this.connections.disconnect(sessionId);
    this.detachQR(sessionId);
    return result;
  }

  /** Explicitly revoke local access; caller must already be authenticated. */
  async revoke(principalId, sessionId) {
    this.authorize(principalId, sessionId);
    await this.disconnect(principalId, sessionId);
    if (this.ownershipStore) await this.ownershipStore.revoke(sessionId, principalId);
    else this.owners.delete(sessionId);
    // Do not clear pairing attempt limits here: revocation must not reset throttling.
  }
}

export default SessionAccessController;
