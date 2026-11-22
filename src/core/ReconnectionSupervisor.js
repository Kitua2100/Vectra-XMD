import { DisconnectReason } from '@whiskeysockets/baileys';

/** Opt-in supervisor; does not modify the legacy bot or automatically start sessions. */
export class ReconnectionSupervisor {
  constructor({ connectionManager, baseDelayMs = 1000, maxDelayMs = 30000,
    maxAttempts = 5, setTimer = setTimeout, clearTimer = clearTimeout,
    random = Math.random, logger = console, onSocket = null } = {}) {
    if (!connectionManager || !Number.isInteger(maxAttempts) || maxAttempts < 1 ||
        !Number.isFinite(baseDelayMs) || baseDelayMs < 1 ||
        !Number.isFinite(maxDelayMs) || maxDelayMs < baseDelayMs) {
      throw new Error('Invalid reconnection supervisor configuration');
    }
    this.manager = connectionManager;
    this.baseDelayMs = baseDelayMs;
    this.maxDelayMs = maxDelayMs;
    this.maxAttempts = maxAttempts;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.random = random;
    this.logger = logger;
    this.onSocket = onSocket;
    this.active = new Map();
  }

  async start(sessionId) {
    this.manager.sessionManager.validateId(sessionId);
    if (!this.manager.sessionManager.getSession(sessionId)) throw new Error('Session not found');
    if (this.active.has(sessionId)) throw new Error('Session is already supervised');
    const entry = { stopped: false, attempts: 0, timer: null, socket: null, listener: null };
    this.active.set(sessionId, entry);
    try { await this.connect(sessionId, entry); }
    catch (error) { this.active.delete(sessionId); throw error; }
  }

  async connect(sessionId, entry) {
    if (entry.stopped || this.active.get(sessionId) !== entry) return;
    await this.manager.connect(sessionId);
    const socket = this.manager.getSocket(sessionId);
    if (!socket || entry.stopped || this.active.get(sessionId) !== entry) return;
    this.onSocket?.(sessionId, socket);
    // The manager's own listener runs first, and updates its status on close.
    const listener = update => {
      if (entry.stopped || this.active.get(sessionId) !== entry || entry.socket !== socket) return;
      if (update.connection === 'open') {
        entry.attempts = 0;
      } else if (update.connection === 'close') {
        this.detach(entry);
        const code = update.lastDisconnect?.error?.output?.statusCode;
        if (code === DisconnectReason.loggedOut) { this.active.delete(sessionId); entry.stopped = true; return; }
        this.schedule(sessionId, entry);
      }
    };
    entry.socket = socket;
    entry.listener = listener;
    socket.ev.on('connection.update', listener);
    if (entry.stopped) this.detach(entry);
  }

  detach(entry) {
    if (entry.socket && entry.listener) {
      const ev = entry.socket.ev;
      if (typeof ev.off === 'function') ev.off('connection.update', entry.listener);
      else ev.removeListener?.('connection.update', entry.listener);
    }
    entry.socket = null;
    entry.listener = null;
  }

  schedule(sessionId, entry) {
    if (entry.stopped || entry.timer !== null || this.active.get(sessionId) !== entry) return;
    if (entry.attempts >= this.maxAttempts) {
      if (this.manager.sessionManager.getSession(sessionId)) {
        this.manager.sessionManager.updateStatus(sessionId, 'error');
      }
      return;
    }
    const delay = Math.min(this.maxDelayMs, this.baseDelayMs * 2 ** entry.attempts);
    const jitter = 0.8 + Math.min(1, Math.max(0, this.random())) * 0.4;
    entry.attempts++;
    if (this.manager.sessionManager.getSession(sessionId)) {
      this.manager.sessionManager.updateStatus(sessionId, 'reconnecting');
    }
    entry.timer = this.setTimer(() => {
      entry.timer = null;
      if (entry.stopped) return;
      void this.connect(sessionId, entry).catch(error => {
        this.logger.warn?.(`Reconnect failed for ${sessionId}: ${error.message}`);
        this.schedule(sessionId, entry);
      });
    }, Math.round(delay * jitter));
  }

  async stop(sessionId) {
    this.manager.sessionManager.validateId(sessionId);
    const entry = this.active.get(sessionId);
    if (!entry) return false;
    entry.stopped = true;
    this.active.delete(sessionId);
    if (entry.timer !== null) this.clearTimer(entry.timer);
    this.detach(entry);
    await this.manager.disconnect(sessionId);
    return true;
  }

  async shutdown() {
    const results = await Promise.allSettled([...this.active.keys()].map(id => this.stop(id)));
    const failures = results.filter(r => r.status === 'rejected');
    if (failures.length) throw new AggregateError(failures.map(r => r.reason), 'Failed to stop supervised sessions');
  }
}

export default ReconnectionSupervisor;
