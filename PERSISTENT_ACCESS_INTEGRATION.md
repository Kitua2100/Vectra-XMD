# Phase 8: Persistent ownership integrated with SessionAccessController

Use only in trusted server startup code, not in public routes.

```js
const access = await SessionAccessController.fromOwnershipStore({
  ownershipStore: new OwnershipStore(),
  sessionManager, connectionManager, pairingManager
});
// Trusted admin provisioning only, after sessionManager.createSession('s1'):
await access.provisionOwner('verifiedUser1', 's1');
```

`fromOwnershipStore` loads the registry and creates missing session records from stored ownership. If persisted sessions exceed `maxSessions`, initialization fails closed. `registerOwner` remains available only in legacy in-memory mode; it throws in persistent mode. Revocation disconnects first, then removes persisted ownership. No user authentication, public API, or automatic reconnect wiring is included. Do not accept principal IDs from request bodies. A single-process store is required.

Run `node --test tests/*.test.js` in Termux. Existing `index.js` is unchanged.
