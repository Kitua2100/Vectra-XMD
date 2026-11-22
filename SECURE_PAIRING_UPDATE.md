# Vectra-XMD secure session access update

New files:
- `src/core/SessionAccessController.js`
- `tests/sessionAccessController.test.js`

The controller is **opt-in**. It does not expose HTTP routes or authenticate users. Its `principalId` MUST come from verified server-side authentication, never directly from a client-supplied user ID. `registerOwner` must be invoked only by trusted provisioning code. Owner mappings are in memory and must be restored from an authenticated, persistent data store on restart before exposing any network endpoints. Do not treat this as a production-ready multi-tenant authentication system.

Example wiring (after constructing the three existing managers):

```js
import SessionAccessController from './src/core/SessionAccessController.js';
const access = new SessionAccessController({
  sessionManager,
  connectionManager,
  pairingManager
});
// Trusted provisioning only:
// sessionManager.createSession('user1');
// access.registerOwner(verifiedUserId, 'user1');
// await access.connect(verifiedUserId, 'user1');
// const qr = access.getQR(verifiedUserId, 'user1');
// const pairing = await access.requestPairingCode(verifiedUserId, 'user1', '254712345678');
```

Security limitations before public release:
1. Add real authentication and durable authorization mapping; never allow users to claim existing sessions by calling registerOwner.
2. Ensure QR codes and pairing codes are delivered only through authenticated HTTPS responses, never public logs or URLs; use no-store headers.
3. PairingManager throttling is in-memory and session-scoped; enforce per-account and per-IP rate limits at the API boundary.
4. QR updates occurring before `connect()` finishes may be missed; consider attaching listeners before the socket starts when building a live pairing endpoint.
5. This controller is not automatically wired into ReconnectionSupervisor; reconnecting sockets need listener reattachment.
6. Verify the full test suite in Termux against installed Baileys, and perform controlled real-device pairing tests.

Testing:
```
node --test tests/*.test.js
```

The original `index.js` is unchanged. Do not overwrite existing auth/session folders when installing updates.
