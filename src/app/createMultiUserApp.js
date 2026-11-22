import path from 'node:path';
import AuditLog from '../core/AuditLog.js';
import SessionManager from '../core/SessionManager.js';
import OwnershipStore from '../core/OwnershipStore.js';
import UserAuthStore from '../core/UserAuthStore.js';
import WhatsAppConnectionManager from '../core/WhatsAppConnectionManager.js';
import PairingManager from '../whatsapp/PairingManager.js';
import SocketFactory from '../whatsapp/SocketFactory.js';
import SessionAccessController from '../core/SessionAccessController.js';
import ReconnectionSupervisor from '../core/ReconnectionSupervisor.js';
import { createManagementApi, listenLocal } from '../api/createManagementApi.js';

/** Local-only application composition. No auto-connect, public bind, or user provisioning. */
export async function createMultiUserApp({
  privateDir = path.resolve('private'), authDir = path.resolve('auth'),
  socketFactory, maxSessions = 3, enableReconnection = true
} = {}) {
  const ownershipStore = await new OwnershipStore({
    filePath: path.join(privateDir, 'session-owners.json')
  }).load();
  const userAuthStore = await new UserAuthStore({
    filePath: path.join(privateDir, 'users.json')
  }).load();
  const owned = ownershipStore.list();
  if (owned.length > maxSessions) {
    throw new Error('Persisted session count exceeds configured session limit');
  }
  const sessionManager = new SessionManager({ maxSessions });
  const createSocket = socketFactory ?? new SocketFactory({
    authStore: new (await import('../whatsapp/AuthStore.js')).default({ baseDir: authDir })
  }).asFactory();
  const connectionManager = new WhatsAppConnectionManager({ sessionManager, socketFactory: createSocket });
  const pairingManager = new PairingManager({ sessionManager });
  const reconnectionSupervisor = enableReconnection ? new ReconnectionSupervisor({
    connectionManager, onSocket: (id, socket) => accessController.trackQR(id, socket)
  }) : null;
  const accessController = await SessionAccessController.fromOwnershipStore({
    ownershipStore, sessionManager, connectionManager, pairingManager, reconnectionSupervisor
  });
  const auditLog = new AuditLog({ filePath: path.join(privateDir, 'audit.jsonl') });
  const api = createManagementApi({ authStore: userAuthStore, accessController, auditLog });
  let listening = false;
  return {
    ownershipStore, userAuthStore, sessionManager, connectionManager,
    pairingManager, accessController, reconnectionSupervisor, auditLog, api,
    async listen(options) {
      if (listening) throw new Error('Management API already listening');
      const address = await listenLocal(api, options);
      listening = true;
      return address;
    },
    async shutdown() {
      // Shut down sockets before closing HTTP. No credentials are deleted.
      if (reconnectionSupervisor) await reconnectionSupervisor.shutdown();
      await connectionManager.shutdown();
      if (api.listening) {
        await new Promise((resolve, reject) => api.close(err => err ? reject(err) : resolve()));
      }
      listening = false;
    }
  };
}
export default createMultiUserApp;
