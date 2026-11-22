import path from 'node:path';
import UserAuthStore from '../core/UserAuthStore.js';
import OwnershipStore from '../core/OwnershipStore.js';
import SessionAdministration from './SessionAdministration.js';

async function main(args) {
  const [command, ...params] = args;
  const usage = 'Usage: node src/app/manageSessions.js list | assign USER_ID SESSION_ID | revoke USER_ID SESSION_ID';
  if (!(['list', 'assign', 'revoke'].includes(command)) ||
      (command === 'list' && params.length !== 0) ||
      (command !== 'list' && params.length !== 2)) {
    throw new Error(usage);
  }
  const users = await new UserAuthStore({ filePath: path.resolve('private/users.json') }).load();
  const ownership = await new OwnershipStore({ filePath: path.resolve('private/session-owners.json') }).load();
  const admin = new SessionAdministration({ users, ownership });
  if (command === 'list') {
    for (const { sessionId, principalId } of admin.list()) console.log(`${sessionId}\t${principalId}`);
    return;
  }
  const [userId, sessionId] = params;
  if (command === 'assign') {
    await admin.assign(userId, sessionId);
    console.log(`Assigned session ${sessionId} to ${userId}`);
  } else {
    await admin.revoke(userId, sessionId);
    console.log(`Revoked session ${sessionId} from ${userId}`);
  }
}

main(process.argv.slice(2)).catch(error => {
  console.error('Session administration failed:', error.message);
  process.exitCode = 1;
});
