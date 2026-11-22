import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
const root = new URL('../', import.meta.url);
process.chdir(root.pathname);
const required = ['@whiskeysockets/baileys', 'qrcode'];
for (const name of required) {
  try { console.log(`Dependency OK: ${name} -> ${import.meta.resolve(name)}`); }
  catch { console.error(`Missing dependency: ${name}. Run npm install before verification.`); process.exit(1); }
}
if (!existsSync('tests/phase15EndToEnd.test.js')) process.exit(1);
console.log('Running all project tests against locally installed dependencies...');
const result = spawnSync(process.execPath, ['--test', 'tests/*.test.js'], { stdio: 'inherit', shell: true });
if (result.error) { console.error(result.error.message); process.exit(1); }
process.exit(result.status ?? 1);
