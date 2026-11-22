# Phase 15 — Local integration verification (not live WhatsApp verification)

This phase adds a full local HTTP workflow test using mocked WhatsApp sockets. It exercises persistent user provisioning, two users, login, ownership isolation, QR generation/clearance, connection open, manual disconnect, logout and restart restoration. **It does not claim live WhatsApp pairing or reconnection has been verified.** The original `index.js` is unchanged.

## Install safely in Termux

Extract this ZIP into a **new** directory, not over a running installation. Never copy old `auth/`, `session/`, `private/`, `.env`, or `node_modules/` from an untrusted archive. Keep your existing private directories backed up securely. Run `npm install` if dependencies are not already installed, then:

```sh
node scripts/verifyPhase15.mjs
```

For a focused test: `node --test tests/phase15EndToEnd.test.js`.

## Controlled live test (only with a WhatsApp account you own)

1. Stop any other process using the same WhatsApp auth directory. Back up credentials privately.
2. Start the local server: `node src/app/runLocal.js`. It binds to `127.0.0.1` only.
3. Provision a local account with `node src/app/provisionUser.js alice` **while the server is stopped**. Assign a session with `node src/app/manageSessions.js assign alice alice_phone` while stopped. Restart the server.
4. Open `http://127.0.0.1:8787/dashboard` on the same phone, log in and connect the assigned session. Pair by QR or phone number using only your own account. Do not share QR, pairing codes or tokens.
5. Check `connecting` -> `connected`, then test Wi-Fi interruption, disconnect and restart. **Automatic reconnection is not wired into the local API yet**; reconnect manually for now. Never expose the development API to the internet.

## Release gates still outstanding

- Test live Baileys 7 compatibility and phone pairing on Termux.
- Integrate and verify reconnection supervision with explicit stop semantics.
- Handle process crashes, cross-process file locking, account lifecycle, secret rotation and deployment hardening.
- Fix security concerns before internet-facing use: token storage in the dashboard, per-account rate limits and safe provisioning.
