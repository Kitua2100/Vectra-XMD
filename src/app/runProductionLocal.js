/** Production-mode local process. Terminate TLS at a reviewed reverse proxy.
 * Never expose this HTTP server directly to the internet. */
import { createMultiUserApp } from './createMultiUserApp.js';
const app = await createMultiUserApp({ maxSessions: Number(process.env.VECTRA_MAX_SESSIONS || 3) });
await app.listen({ host: '127.0.0.1', port: Number(process.env.VECTRA_PORT || 8787) });
console.log('Vectra-XMD management service listening on loopback');
let stopping = false;
async function stop() { if (stopping) return; stopping = true; await app.shutdown(); process.exit(0); }
process.on('SIGTERM', () => void stop());
process.on('SIGINT', () => void stop());
