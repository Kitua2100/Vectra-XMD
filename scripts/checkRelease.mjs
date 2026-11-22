import { readFile, stat, readdir } from 'node:fs/promises';
import path from 'node:path';
const root = process.cwd();
const problems = [];
const warnings = [];
const pkg = JSON.parse(await readFile('package.json','utf8'));
if (!pkg.dependencies?.['@whiskeysockets/baileys']) problems.push('Baileys dependency missing');
if (process.env.NODE_ENV !== 'production') warnings.push('NODE_ENV is not production');
for (const name of ['private','auth']) {
  try { const info = await stat(path.join(root,name)); if ((info.mode & 0o077) !== 0) problems.push(`${name}/ accessible by group or others`); }
  catch (e) { if (e.code !== 'ENOENT') problems.push(`${name}: ${e.message}`); }
}
for (const name of ['.env','private/users.json','private/session-owners.json']) {
  try { const info = await stat(name); if ((info.mode & 0o077) !== 0) problems.push(`${name} permissions too broad`); }
  catch (e) { if (e.code !== 'ENOENT') problems.push(`${name}: ${e.message}`); }
}
if (process.env.VECTRA_PUBLIC_BIND) problems.push('Public binding is not supported by this development API');
if (!process.env.VECTRA_BACKUP_KEY) warnings.push('No encrypted backup key configured; use a secure external backup solution');
warnings.push('Live Baileys pairing, network recovery, load, security review and platform-policy checks require manual verification');
console.log(JSON.stringify({readyForPublicDeployment: false, blockingIssues: problems, warnings}, null, 2));
process.exitCode = problems.length ? 1 : 0;
