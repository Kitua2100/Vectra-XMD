/** Offline backup helper. Stop the app first; treat resulting archive as secret. */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, chmodSync } from 'node:fs';
import path from 'node:path';
const destination = process.argv[2];
if (!destination || !path.isAbsolute(destination)) throw new Error('Provide absolute backup destination path');
if (!existsSync('private') || !existsSync('auth')) throw new Error('private/ and auth/ required');
mkdirSync(path.dirname(destination), { recursive: true, mode: 0o700 });
const result = spawnSync('tar', ['-czf', destination, 'private', 'auth'], { stdio: 'inherit' });
if (result.status !== 0) throw new Error('Backup failed');
chmodSync(destination, 0o600);
console.log('Backup created. Encrypt it before storing off-server.');
