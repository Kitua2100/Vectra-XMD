import path from 'node:path';
import { stdin, stdout } from 'node:process';
import UserAuthStore from '../core/UserAuthStore.js';

async function readHiddenPassword(prompt) {
  if (!stdin.isTTY || !stdout.isTTY || typeof stdin.setRawMode !== 'function') throw new Error('Interactive TTY required');
  stdout.write(prompt);
  return new Promise((resolve, reject) => {
    let value = '';
    const cleanup = () => { stdin.off('data', onData); stdin.setRawMode(false); stdin.pause(); stdout.write('\n'); };
    const onData = chunk => {
      for (const char of chunk.toString('utf8')) {
        if (char === '\r' || char === '\n') { cleanup(); resolve(value); return; }
        if (char === '\u0003') { cleanup(); reject(new Error('Cancelled')); return; }
        if (char === '\u007f' || char === '\b') { value = value.slice(0, -1); continue; }
        if (value.length >= 1024) { cleanup(); reject(new Error('Password too long')); return; }
        if (char >= ' ') value += char;
      }
    };
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on('data', onData);
  });
}
const userId = process.argv[2];
if (!userId || process.argv.length !== 3) {
  console.error('Usage: node src/app/provisionUser.js USER_ID');
  process.exitCode = 2;
} else {
  try {
    const password = await readHiddenPassword('New password (hidden): ');
    const confirm = await readHiddenPassword('Confirm password (hidden): ');
    if (password !== confirm) throw new Error('Passwords do not match');
    const store = await new UserAuthStore({ filePath: path.resolve('private/users.json') }).load();
    await store.createUser(userId, password);
    console.log(`Provisioned user ${userId}. No session ownership assigned.`);
  } catch (error) {
    console.error('Provisioning failed:', error.message);
    process.exitCode = 1;
  }
}
