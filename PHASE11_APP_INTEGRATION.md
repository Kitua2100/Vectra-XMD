# Phase 11 — Local application integration

`src/app/createMultiUserApp.js` composes persisted owners, users, sessions, WhatsApp sockets, pairing, access checks, and the Phase 10 local HTTP API. `src/app/runLocal.js` starts the management API on **127.0.0.1:8787** (no public bind). The legacy `index.js` remains unchanged.

## Termux checks

```sh
npm install
node --test tests/*.test.js
node src/app/runLocal.js
# From another Termux terminal:
curl -s http://127.0.0.1:8787/health
```

No account creation is exposed over HTTP. The local server does **not** automatically reconnect or pair restored sessions; the opt-in ReconnectionSupervisor is not yet integrated into the API controller. User provisioning must be done only through a trusted local administrative workflow, which is **not yet provided**. Do not use a public reverse proxy or open the listener to the internet.

## Security and deployment notes

- Keep `private/`, `auth/`, `.env`, and `session/` out of Git and ZIP archives.
- The API is single-process; login limits and pairing limits are in memory.
- Live WhatsApp pairing and real Baileys operation are not tested by mock tests.
- Run the new local server separately from the legacy bot until integration is verified.
- Before public deployment: add trusted provisioning, persistent abuse controls, authenticated dashboard, audit logging, and controlled reconnection.
