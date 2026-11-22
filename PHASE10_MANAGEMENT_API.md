# Phase 10 — Local authenticated management API

Added `src/api/createManagementApi.js` and `tests/managementApi.test.js`.

Routes: `GET /health`, `POST /auth/login`, `POST /auth/logout`, `GET /sessions/:id/status`, `GET /sessions/:id/qr`, `POST /sessions/:id/connect`, `POST /sessions/:id/disconnect`, `POST /sessions/:id/pair` (body `{ "phoneNumber": "254712345678" }`). All session endpoints require `Authorization: Bearer <token>` and enforce server-derived user identity and session ownership. No public registration or owner-provisioning routes exist.

**Not automatically started:** Compose the previously implemented stores/managers from trusted server startup code and pass them to `createManagementApi({ authStore, accessController })`; use `listenLocal(api)` to bind to 127.0.0.1 only. This API is intended for local development and private testing. The existing `index.js` remains unchanged.

**Security limitations:** The in-memory IP login limiter is single-process and resets on restart; do not publish this API on the internet or proxy it publicly. QR/pairing codes are secrets; don't log or share them. Before production, add persistent distributed rate limiting, secure TLS reverse proxy with deliberate trust boundaries, audit logs, safe provisioning, CSRF/origin protection where applicable, and full real-Baileys integration tests. Authentication tokens are bearer secrets. Never expose the server to a public interface by modifying the loopback restriction without a separate security review.

Tests: `node --test tests/*.test.js` in Termux with dependencies installed. Do not overwrite your working project without a backup. This ZIP intentionally excludes `.env`, auth/session directories and private data.
