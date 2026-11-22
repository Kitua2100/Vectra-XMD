# Phase 12 — Local Dashboard Preview

This release adds a responsive, dependency-free browser dashboard to the Phase 11 management API. It is intentionally **local-only** and is not production-ready.

## Run

1. Back up your existing Termux project. Extract this archive into a NEW folder, not over a live bot.
2. Install dependencies using your normal npm workflow (`npm install` if required).
3. Run `node --test tests/*.test.js`.
4. Run `node src/app/runLocal.js`.
5. On the same device open `http://127.0.0.1:8787/dashboard` in a browser.

## Access and limitations

- Accounts and session ownership must already be provisioned through trusted local administrative code; there is no public signup or session provisioning endpoint.
- Session list is restricted to the authenticated user's owned sessions.
- Login token is held in browser memory (not localStorage); a page refresh requires login again.
- QR is rendered server-side using the project's existing `qrcode` dependency. QR codes and pairing codes are secrets. Do not screenshot, share, or log them.
- QR availability depends on live Baileys connection events and may expire quickly. Use Connect first.
- API and dashboard listen only on loopback; do not expose them through port forwarding or a reverse proxy.
- Existing legacy `index.js` is unchanged; automatic reconnection is not wired to the new app yet.
- Do not assume a multi-user dashboard is safe for public use until HTTPS, provisioning, audit logging, rate limits, token/session controls, and live integration tests are completed.

## Tests

`node --test tests/*.test.js`: 86 passed locally. These tests do not prove live WhatsApp login or public deployment readiness.
