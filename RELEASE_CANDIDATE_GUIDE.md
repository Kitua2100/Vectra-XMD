# Vectra-XMD integration candidate — phases 16–21 work package

**NOT APPROVED FOR PUBLIC DEPLOYMENT.** This package consolidates feasible offline changes. It cannot establish live WhatsApp functionality, security assurance, load capacity, or WhatsApp platform compliance.

## Included and testable
- Phase 16/17: opt-in-by-composition reconnection supervisor wired into the multi-user API, per-session exponential backoff, and QR event reattachment after reconnect. Existing legacy `index.js` unchanged.
- Phase 18: browser-origin check on API requests, continued local-only bind, hashed session tokens and account ownership. This is defense in depth, not a production security audit.
- Phase 20/21: offline release preflight script, integration tests, and deployment acceptance checklist.

## Still incomplete / deployment blockers
- Real QR and phone pairing and credential persistence on Baileys 7 must be verified on an owned WhatsApp account.
- Plugin/message pipeline is still in legacy `index.js`; no per-user plugin execution or isolated user settings. Do not advertise a fully functional multi-user bot.
- Production-grade storage/migrations, crash consistency, backups, secrets rotation, secure proxy/TLS, user management, multi-process coordination, metrics/alerts, load tests, and security review.
- Official WhatsApp Business Platform evaluation and terms/policy compliance; Baileys is unofficial and may lead to service disruption or account restrictions.
- Multi-user dashboard UX, accessibility, account recovery, and invitation lifecycle.

## Safe install in Termux
1. Back up current project and WhatsApp credentials separately; never upload them.
2. Extract this archive to a **new directory**; do not overwrite your live project.
3. `npm ci` (if lockfile is present) or `npm install`.
4. `node --test tests/*.test.js`
5. `node scripts/checkRelease.mjs`
6. Provision test users and sessions with documented trusted CLI tools, then start `node src/app/runLocal.js`.
7. Test one owned account, restart, pairing, disconnect/reconnect, and two-user isolation locally.
8. Keep API on 127.0.0.1. Never expose to public internet without a reviewed deployment design.

## Release gate
- [ ] Complete tests pass with actual dependencies on Termux and target Linux server.
- [ ] Live pairing/recovery and credentials verified for each supported platform.
- [ ] Unauthorized users cannot view QR, pairing codes, or session credentials.
- [ ] User-specific plugin commands are isolated and tested.
- [ ] Persistent database has migrations, concurrency guarantees, and encrypted tested backups.
- [ ] Production authentication hardening, token rotation, rate limiting and audit retention.
- [ ] TLS, domain, proxy, monitoring, incident response, and rollback are exercised.
- [ ] Performance, resilience, security, accessibility, and privacy review complete.
- [ ] Controlled beta with consent and clear unofficial WhatsApp integration risk disclosures.
