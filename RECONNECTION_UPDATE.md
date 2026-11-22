# Vectra-XMD opt-in reconnection supervisor

Adds `src/core/ReconnectionSupervisor.js` and `tests/reconnectionSupervisor.test.js` to the lifecycle update. The legacy `index.js` is unchanged.

Features: per-session retry timers, capped exponential backoff with jitter, reset on `open`, no retries on logout, manual stop/shutdown cancels timers, session isolation. Reconnection is **opt-in**, not automatically enabled in the original bot.

## Example (internal code only)
```js
import SessionManager from './src/core/SessionManager.js';
import WhatsAppConnectionManager from './src/core/WhatsAppConnectionManager.js';
import SocketFactory from './src/whatsapp/SocketFactory.js';
import ReconnectionSupervisor from './src/core/ReconnectionSupervisor.js';

const sessions = new SessionManager();
const sockets = new SocketFactory();
const connections = new WhatsAppConnectionManager({sessionManager: sessions, socketFactory: sockets.asFactory()});
const supervisor = new ReconnectionSupervisor({connectionManager: connections});
sessions.createSession('user1');
await supervisor.start('user1');
// Later: await supervisor.stop('user1'); or await supervisor.shutdown();
```

## Testing
Run `npm install` if needed, then `node --test tests/*.test.js` in Termux. The archive does not contain installed dependencies or credentials. Tests here were run using a minimal Baileys export stub; real package and live network remain unverified.

## Safety / known limitations
- Do not expose session management or pairing endpoints publicly without authentication and authorization.
- Reconnection handles close events and failed reconnect attempts, but an initial connection failure is returned to the caller, and a socket that never opens/closes has no timeout yet.
- Avoid calling `connections.connect` or `connections.disconnect` directly on sessions supervised by this class.
- Manual logout/credential revocation and durable session ownership are not yet implemented.
- Back up your existing project and merge selectively; never overwrite local `.env`, `auth/` or `session/`.
