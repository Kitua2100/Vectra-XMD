# Phase 7: Persistent session ownership (opt-in)

Adds `src/core/OwnershipStore.js` and `tests/ownershipStore.test.js`.

The store persists trusted session-to-principal assignments in `private/session-owners.json` (mode 0600); the private directory is gitignored. Assignments are serialized and written via atomic rename. No HTTP routes or account authentication are introduced.

Example trusted provisioning (not exposed to clients):

```js
import OwnershipStore from './src/core/OwnershipStore.js';
const owners = await new OwnershipStore().load();
await owners.assign('session1', 'verifiedPrincipal1');
console.log(owners.getOwner('session1'));
```

**Important:** The existing `SessionAccessController` still uses its own in-memory owners map. This persistence module is not yet wired into that controller. Before public use, implement an authenticated initialization/reconciliation flow that verifies persisted owners against trusted account records; never allow a client to invoke `assign`. The store is suitable for one server process only, not concurrent processes or distributed deployments. Back up the private registry securely. No credentials, QR codes, or pairing codes belong in this registry.

Test with `node --test tests/ownershipStore.test.js` and `node --test tests/*.test.js` in Termux. The legacy `index.js` is unchanged.
