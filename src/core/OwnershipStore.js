import fs from 'node:fs/promises';
import path from 'node:path';

/** Private, file-backed ownership registry. Provision only from trusted server code. */
export class OwnershipStore {
  constructor({ filePath = path.resolve('private/session-owners.json') } = {}) {
    this.filePath = path.resolve(filePath);
    this.owners = new Map();
    this.loaded = false;
    this.queue = Promise.resolve();
  }

  validateId(value) {
    if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(value)) {
      throw new Error('Invalid identifier');
    }
  }

  async load() {
    if (this.loaded) throw new Error('Ownership store already loaded');
    await fs.mkdir(path.dirname(this.filePath), { recursive: true, mode: 0o700 });
    await fs.chmod(path.dirname(this.filePath), 0o700);
    let raw;
    try {
      raw = await fs.readFile(this.filePath, 'utf8');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      raw = '{"version":1,"owners":{}}';
    }
    const data = JSON.parse(raw);
    if (!data || data.version !== 1 || !data.owners ||
        typeof data.owners !== 'object' || Array.isArray(data.owners)) {
      throw new Error('Invalid ownership registry');
    }
    const owners = new Map();
    for (const [sessionId, principalId] of Object.entries(data.owners)) {
      this.validateId(sessionId);
      this.validateId(principalId);
      owners.set(sessionId, principalId);
    }
    this.owners = owners;
    this.loaded = true;
    return this;
  }

  ensureLoaded() {
    if (!this.loaded) throw new Error('Ownership store not initialized');
  }

  getOwner(sessionId) {
    this.ensureLoaded();
    this.validateId(sessionId);
    return this.owners.get(sessionId) ?? null;
  }

  list() {
    this.ensureLoaded();
    return [...this.owners.entries()].map(([sessionId, principalId]) => ({ sessionId, principalId }));
  }

  /** Serialize mutations; only update memory after durable write succeeds. */
  mutate(action) {
    const operation = this.queue.catch(() => {}).then(async () => {
      this.ensureLoaded();
      const next = new Map(this.owners);
      const result = action(next);
      await this.persist(next);
      this.owners = next;
      return result;
    });
    this.queue = operation;
    return operation;
  }

  assign(sessionId, principalId) {
    this.validateId(sessionId);
    this.validateId(principalId);
    return this.mutate(next => {
      if (next.has(sessionId)) throw new Error('Session owner already assigned');
      next.set(sessionId, principalId);
      return true;
    });
  }

  revoke(sessionId, principalId) {
    this.validateId(sessionId);
    this.validateId(principalId);
    return this.mutate(next => {
      if (next.get(sessionId) !== principalId) throw new Error('Access denied');
      next.delete(sessionId);
      return true;
    });
  }

  async persist(next) {
    const dir = path.dirname(this.filePath);
    const temp = path.join(dir, `.owners-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.tmp`);
    const content = JSON.stringify({ version: 1, owners: Object.fromEntries(next) }, null, 2) + '\n';
    try {
      await fs.writeFile(temp, content, { mode: 0o600, flag: 'wx' });
      await fs.rename(temp, this.filePath);
      await fs.chmod(this.filePath, 0o600);
    } finally {
      await fs.rm(temp, { force: true }).catch(() => {});
    }
  }
}

export default OwnershipStore;
