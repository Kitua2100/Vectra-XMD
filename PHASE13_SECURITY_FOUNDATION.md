# Phase 13 — local security foundation

- Added a restrictive, append-only `AuditLog` at `private/audit.jsonl` with mode 0600; only allowlisted event names, user IDs and session IDs are recorded. No tokens, QR codes, pairing codes or passwords are written.
- Local API records login successes/failures/throttling, logout, denied session access, connect/disconnect and pairing actions. Audit writes are best-effort and asynchronous; a logging failure does not block an API request. This is **not** tamper-proof or centralized audit logging.
- Bounded the in-memory login-throttle map to reduce memory growth. Rate limiting is still single-process, per IP, and unsuitable for a public deployment without a trusted reverse proxy and shared limiter.
- Added a local interactive administrator provisioning command with hidden password input: `node src/app/provisionUser.js alice`. This creates an account only; session ownership must be provisioned separately through trusted server-side code.
- No public registration, account provisioning or ownership mutation routes were added.
- Existing `index.js` remains untouched. No real WhatsApp pairing was exercised.

## Test

`node --test tests/*.test.js`

## Safety

Keep `private/`, `auth/`, `session/`, `.env` and other secrets out of source control and shared ZIPs. Do not expose the management API to the internet. This is a local development build; CSRF, browser token storage, login throttling, audit durability, authentication lifecycle and live WhatsApp behavior still require further review.
