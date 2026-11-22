import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
const USERNAME = /^[a-zA-Z0-9_-]{3,64}$/;
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_TOKENS = 5;

/** Trusted-server account store. No HTTP endpoints are provided. Single-process only. */
export class UserAuthStore {
  constructor({ filePath = path.resolve('private/users.json'), now = () => Date.now() } = {}) {
    this.filePath = path.resolve(filePath);
    this.now = now;
    this.users = new Map();
    this.tokens = new Map();
    this.loaded = false;
    this.queue = Promise.resolve();
  }

  async load() {
    if (this.loaded) throw new Error('User store already loaded');
    const dir = path.dirname(this.filePath);
    await fs.mkdir(dir, { recursive: true, mode: 0o700 });
    await fs.chmod(dir, 0o700);
    let data;
    try { data = JSON.parse(await fs.readFile(this.filePath, 'utf8')); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      data = { version: 1, users: {}, tokens: {} };
    }
    if (data?.version !== 1 || !isRecord(data.users) || !isRecord(data.tokens)) throw new Error('Invalid user registry');
    const users = new Map();
    const tokens = new Map();
    for (const [id, value] of Object.entries(data.users)) {
      if (!USERNAME.test(id) || !isRecord(value) || !/^[a-f0-9]{32}$/.test(value.salt) ||
          !/^[a-f0-9]{128}$/.test(value.hash)) throw new Error('Invalid user registry');
      users.set(id, { salt: value.salt, hash: value.hash });
    }
    for (const [digest, value] of Object.entries(data.tokens)) {
      if (!/^[a-f0-9]{64}$/.test(digest) || !isRecord(value) || !users.has(value.userId) ||
          !Number.isSafeInteger(value.expiresAt)) throw new Error('Invalid token registry');
      if (value.expiresAt > this.now()) tokens.set(digest, { userId: value.userId, expiresAt: value.expiresAt });
    }
    this.users = users;
    this.tokens = tokens;
    this.loaded = true;
    return this;
  }

  ensureLoaded() { if (!this.loaded) throw new Error('User store not initialized'); }

  async mutate(action) {
    const task = this.queue.catch(() => {}).then(async () => {
      this.ensureLoaded();
      const users = new Map(this.users);
      const tokens = new Map(this.tokens);
      const result = await action(users, tokens);
      await this.persist(users, tokens);
      this.users = users;
      this.tokens = tokens;
      return result;
    });
    this.queue = task;
    return task;
  }

  /** Only invoke during trusted provisioning, never directly from public HTTP input. */
  async createUser(userId, password) {
    if (typeof userId !== 'string' || !USERNAME.test(userId)) throw new Error('Invalid user identifier');
    validatePassword(password);
    const salt = randomBytes(16).toString('hex');
    const hash = (await scrypt(password, Buffer.from(salt, 'hex'), 64)).toString('hex');
    return this.mutate(users => {
      if (users.has(userId)) throw new Error('User already exists');
      users.set(userId, { salt, hash });
      return { userId };
    });
  }

  async login(userId, password) {
    if (typeof userId !== 'string' || !USERNAME.test(userId) || typeof password !== 'string') {
      throw new Error('Invalid credentials');
    }
    this.ensureLoaded();
    const entry = this.users.get(userId);
    const salt = entry ? Buffer.from(entry.salt, 'hex') : Buffer.alloc(16);
    const calculated = await scrypt(password, salt, 64);
    const expected = entry ? Buffer.from(entry.hash, 'hex') : Buffer.alloc(64);
    if (!entry || !timingSafeEqual(calculated, expected)) throw new Error('Invalid credentials');
    const token = randomBytes(32).toString('hex');
    const digest = tokenDigest(token);
    const expiresAt = this.now() + TOKEN_TTL_MS;
    await this.mutate((_users, tokens) => {
      for (const [key, value] of tokens) if (value.expiresAt <= this.now()) tokens.delete(key);
      const active = [...tokens.entries()].filter(([, value]) => value.userId === userId);
      if (active.length >= MAX_TOKENS) throw new Error('Active session limit reached');
      tokens.set(digest, { userId, expiresAt });
    });
    return { token, expiresAt, userId };
  }

  authenticate(token) {
    this.ensureLoaded();
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) throw new Error('Unauthenticated');
    const entry = this.tokens.get(tokenDigest(token));
    if (!entry || entry.expiresAt <= this.now()) throw new Error('Unauthenticated');
    return { userId: entry.userId };
  }

  async logout(token) {
    this.authenticate(token);
    await this.mutate((_users, tokens) => { tokens.delete(tokenDigest(token)); });
  }

  async persist(users, tokens) {
    const dir = path.dirname(this.filePath);
    const temp = path.join(dir, `.users-${process.pid}-${randomBytes(8).toString('hex')}.tmp`);
    const data = JSON.stringify({ version: 1, users: Object.fromEntries(users), tokens: Object.fromEntries(tokens) }, null, 2) + '\n';
    try {
      await fs.writeFile(temp, data, { mode: 0o600, flag: 'wx' });
      await fs.rename(temp, this.filePath);
      await fs.chmod(this.filePath, 0o600);
    } finally { await fs.rm(temp, { force: true }).catch(() => {}); }
  }
}
function isRecord(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function validatePassword(value) {
  if (typeof value !== 'string' || value.length < 12 || Buffer.byteLength(value) > 1024) {
    throw new Error('Password must be at least 12 characters and no more than 1024 bytes');
  }
}
function tokenDigest(token) { return createHash('sha256').update(token).digest('hex'); }
export default UserAuthStore;
