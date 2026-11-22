import fs from 'node:fs/promises';
import path from 'node:path';

const EVENTS = new Set(['login_success', 'login_failure', 'login_throttled', 'logout', 'access_denied', 'session_connect', 'session_disconnect', 'pairing_requested']);
const IDENTIFIER = /^[a-zA-Z0-9_-]{1,64}$/;

/** Append-only local security audit log. Never records passwords, tokens, QR or pairing codes. */
export class AuditLog {
  constructor({ filePath = path.resolve('private/audit.jsonl'), now = () => new Date().toISOString() } = {}) {
    this.filePath = path.resolve(filePath);
    this.now = now;
    this.queue = Promise.resolve();
  }
  record(event, { userId, sessionId } = {}) {
    if (!EVENTS.has(event)) throw new Error('Unsupported audit event');
    if (userId !== undefined && (typeof userId !== 'string' || !IDENTIFIER.test(userId))) throw new Error('Invalid audit user');
    if (sessionId !== undefined && (typeof sessionId !== 'string' || !IDENTIFIER.test(sessionId))) throw new Error('Invalid audit session');
    const entry = { at: this.now(), event, ...(userId ? { userId } : {}), ...(sessionId ? { sessionId } : {}) };
    const task = this.queue.catch(() => {}).then(async () => {
      const dir = path.dirname(this.filePath);
      await fs.mkdir(dir, { recursive: true, mode: 0o700 });
      await fs.chmod(dir, 0o700);
      await fs.appendFile(this.filePath, JSON.stringify(entry) + '\n', { encoding: 'utf8', mode: 0o600, flag: 'a' });
      await fs.chmod(this.filePath, 0o600);
    });
    this.queue = task;
    return task;
  }
}
export default AuditLog;
