# Phase 9 — Trusted user authentication foundation

Vectra-XMD remains an independent project. Levanter is a benchmark for architecture and UX, not a source of code to copy.

Added `src/core/UserAuthStore.js` and `tests/userAuthStore.test.js`.

The new store uses Node.js built-in scrypt password hashing with random per-user salts, opaque random bearer tokens stored only as SHA-256 digests, expiry, logout, and atomic private-file persistence. User IDs match the existing `SessionAccessController` principal format.

**Not yet wired to HTTP or SessionAccessController.** Do not expose `createUser` directly to untrusted requests. `authenticate(token).userId` is the principal ID to pass to the authorization controller only from trusted server-side middleware.

**Before public deployment:** Add per-account/IP login throttling, CSRF protections for cookie-based sessions, TLS, a trusted admin provisioning flow, password reset, audit logging, single-process concurrency guarantees or a transactional database, token rotation, and full integration tests. File-backed storage is intended for single-process development only.

Install/test in Termux after backing up your project: `npm ci` and `node --test tests/*.test.js`. The original `index.js` is unchanged.
