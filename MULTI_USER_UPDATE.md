# Vectra-XMD multi-user lifecycle update

This update modifies only `src/core/WhatsAppConnectionManager.js` and `tests/connectionManager.test.js`. The legacy `index.js` remains unchanged.

## Changes
- `connect()` returns `connecting` until a Baileys `connection.update` event reports `open`.
- A `close` event sets `disconnected` or `logged_out` (Baileys status 401), clears the tracked socket, and permits a subsequent manual reconnect.
- Stale events from replaced or manually disconnected sockets cannot overwrite the current session status.
- The `getSocket(sessionId)` method retrieves a currently tracked socket for authorized internal integration.
- Unexpected disconnects do not delete credentials and do not automatically reconnect yet.

## Test in Termux
```sh
cd ~/projects/Vectra-XMD
npm install
node --test tests/*.test.js
```

Do not deploy this as a public multi-user service yet: authorization, reconnection supervisor, credential save serialization, and live pairing integration remain outstanding.

## Apply without overwriting local secrets
Make a backup or Git commit of your current work first. Extract the archive into a **new** directory, compare changes, and selectively copy updated files. Do not replace your local `auth/`, `session/`, or `.env` files.
