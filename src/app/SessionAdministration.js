import UserAuthStore from '../core/UserAuthStore.js';
import OwnershipStore from '../core/OwnershipStore.js';

/** Trusted offline administration. Never call directly from an HTTP request. */
export class SessionAdministration {
  constructor({ users, ownership, maxSessions = 3 }) {
    if (!(users instanceof UserAuthStore) || !(ownership instanceof OwnershipStore) || !users.loaded || !ownership.loaded) {
      throw new Error('Initialized user and ownership stores required');
    }
    if (!Number.isSafeInteger(maxSessions) || maxSessions < 1) throw new Error('Invalid session limit');
    this.users = users;
    this.ownership = ownership;
    this.maxSessions = maxSessions;
  }

  list() { return this.ownership.list(); }

  async assign(userId, sessionId) {
    this.ownership.validateId(sessionId);
    if (!this.users.users.has(userId)) throw new Error('User does not exist');
    // Re-check inside the serialized mutation to avoid concurrent assignments exceeding the limit.
    return this.ownership.mutate(next => {
      if (next.has(sessionId)) throw new Error('Session owner already assigned');
      if (next.size >= this.maxSessions) throw new Error('Maximum session limit reached');
      next.set(sessionId, userId);
      return { sessionId, userId };
    });
  }

  async revoke(userId, sessionId) {
    return this.ownership.revoke(sessionId, userId);
  }
}
export default SessionAdministration;
