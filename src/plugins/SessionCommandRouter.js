/** Explicit allowlisted command dispatch. Never loads untrusted code from user input. */
export class SessionCommandRouter {
  constructor({ authorize, maxTextLength = 4096 } = {}) {
    if (typeof authorize !== 'function') throw new Error('Authorization callback required');
    this.authorize = authorize;
    this.maxTextLength = maxTextLength;
    this.commands = new Map();
    this.enabled = new Map();
  }
  register(name, handler) {
    if (!/^[a-z][a-z0-9_-]{0,31}$/.test(name) || typeof handler !== 'function' || this.commands.has(name)) throw new Error('Invalid or duplicate command');
    this.commands.set(name, handler);
  }
  setEnabled(principal, sessionId, name, enabled) {
    this.authorize(principal, sessionId);
    if (!this.commands.has(name) || typeof enabled !== 'boolean') throw new Error('Invalid command configuration');
    const settings = this.enabled.get(sessionId) ?? new Map();
    settings.set(name, enabled); this.enabled.set(sessionId, settings);
  }
  list(principal, sessionId) {
    this.authorize(principal, sessionId);
    return [...this.commands.keys()].map(name => ({ name, enabled: this.enabled.get(sessionId)?.get(name) !== false }));
  }
  async dispatch({ principal, sessionId, text, reply }) {
    this.authorize(principal, sessionId);
    if (typeof text !== 'string' || text.length > this.maxTextLength || typeof reply !== 'function') return false;
    const match = /^!([a-z][a-z0-9_-]{0,31})(?:\s+(.*))?$/is.exec(text.trim());
    if (!match) return false;
    const name = match[1].toLowerCase();
    const handler = this.commands.get(name);
    if (!handler || this.enabled.get(sessionId)?.get(name) === false) return false;
    await handler({ sessionId, principal, args: match[2] ?? '', reply });
    return true;
  }
}
export default SessionCommandRouter;
