import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
/** Single-process SQLite store for non-secret per-session command preferences.
 * Requires a Node version supporting node:sqlite; not a replacement for auth storage. */
export class SqliteSettingsStore {
  constructor({ filePath = path.resolve('private/settings.sqlite') } = {}) {
    this.filePath = path.resolve(filePath);
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(this.filePath);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL);
      INSERT INTO schema_version(version) SELECT 1 WHERE NOT EXISTS (SELECT 1 FROM schema_version);
      CREATE TABLE IF NOT EXISTS command_settings (
        session_id TEXT NOT NULL, command TEXT NOT NULL, enabled INTEGER NOT NULL CHECK(enabled IN (0,1)),
        PRIMARY KEY(session_id,command)
      );`);
    if (this.db.prepare('SELECT version FROM schema_version').get().version !== 1) throw new Error('Unsupported database schema');
    fs.chmodSync(this.filePath, 0o600);
  }
  validate(id) { if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(id)) throw new Error('Invalid identifier'); }
  set(sessionId, command, enabled) {
    this.validate(sessionId); this.validate(command);
    if (typeof enabled !== 'boolean') throw new Error('Invalid setting');
    this.db.prepare(`INSERT INTO command_settings(session_id,command,enabled) VALUES(?,?,?)
      ON CONFLICT(session_id,command) DO UPDATE SET enabled=excluded.enabled`).run(sessionId, command, Number(enabled));
  }
  get(sessionId, command) {
    this.validate(sessionId); this.validate(command);
    const row = this.db.prepare('SELECT enabled FROM command_settings WHERE session_id=? AND command=?').get(sessionId,command);
    return row ? Boolean(row.enabled) : null;
  }
  list(sessionId) {
    this.validate(sessionId);
    return this.db.prepare('SELECT command,enabled FROM command_settings WHERE session_id=?').all(sessionId).map(x=>({command:x.command,enabled:Boolean(x.enabled)}));
  }
  close() { this.db.close(); }
}
