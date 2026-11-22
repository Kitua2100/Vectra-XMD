import createMultiUserApp from './createMultiUserApp.js';

const app = await createMultiUserApp();
const address = await app.listen();
console.log(`Vectra-XMD local management API listening on ${address.address}:${address.port}`);
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  try { await app.shutdown(); process.exitCode = 0; }
  catch (error) { console.error('Shutdown failed:', error.message); process.exitCode = 1; }
}
process.once('SIGINT', () => { void stop(); });
process.once('SIGTERM', () => { void stop(); });
