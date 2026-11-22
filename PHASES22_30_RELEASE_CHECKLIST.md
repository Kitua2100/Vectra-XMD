# Vectra-XMD Phases 22–30: integrated development package

**Status: DEVELOPMENT / NOT PUBLIC-DEPLOYABLE.** No real WhatsApp tests or third-party security audit were performed in this build. Do not confuse code scaffolding with verified production functionality.

| Phase | Included in this archive | Still required |
|---|---|---|
| 22 | Existing QR-image and pairing-code API/dashboard; manual test protocol | Live WhatsApp QR + phone pairing on Termux and server; account compatibility |
| 23 | `SessionCommandRouter` with per-session authorization and safe `!ping`/`!help` examples | Adapt original plugins; wire socket `messages.upsert` to the router; user-specific configuration persistence |
| 24 | SQLite WAL-backed non-secret command-settings store, schema version check | Migrate user/auth/ownership stores with transactional semantics; concurrency and migration tests; restore drill |
| 25 | HTTP request/header timeouts, stricter API headers, existing access checks | Distributed throttling, credential rotation, secure cookie/session architecture, penetration test |
| 26 | 15-second status refresh, existing QR/pairing interface | UX polish, error states, accessibility audit, command settings UI |
| 27 | systemd and nginx HTTPS **examples**, loopback-only production launcher | Configure domain/TLS, secrets, firewall, service user, CI/CD, real production deployment |
| 28 | Existing audit log/reconnect supervisor, health uptime, backup helper | Monitoring/alerts, retention, encrypted offsite backups and restore tests |
| 29 | Bounded request timeouts and small-memory session routing | Load test, memory/CPU profiling, multi-process coordination |
| 30 | Automated unit tests and this acceptance checklist | Independent security audit, controlled live beta, policy/compliance review |

## Safety notes

- **Do not expose port 8787 to the public internet.** It binds to loopback only; proxy examples are not a security certification.
- Original `index.js` and `plugins/` are retained but **not automatically integrated** into the new per-session command router.
- SQLite is only used by the new optional settings store; **the existing JSON user and ownership registries remain unchanged**.
- Do not run offline provisioning or backup scripts while the API is writing files. Stop the service first.
- Never share `.env`, `private/`, `auth/`, backups, or pairing codes. ZIP intentionally excludes secrets.
- Baileys is unofficial WhatsApp Web integration; account restrictions and breaking changes remain possible.

## Termux verification (user will run later)

1. Extract into a NEW folder. Do not overwrite your working project or credentials.
2. `npm install` then `node scripts/inspectEnvironment.mjs`.
3. `node --test tests/*.test.js`.
4. Create two test accounts and two sessions using trusted local administration.
5. Test QR and pairing separately with consenting accounts; verify QR expiry, restart, reconnection and isolation.
6. Test the original bot plugin integration only after the socket event adapter has been written.
7. Perform backup + restore drill, external security review, and closed beta before launch.

## Acceptance gates (all must pass before public release)

- [ ] QR and pairing succeed on real WhatsApp accounts, with redacted logs.
- [ ] Network loss, forced socket close, process restart and logout recover correctly.
- [ ] No cross-user access to QR, pairing, messages, commands, credentials, or audit logs.
- [ ] Original commands work for multiple users without shared mutable state.
- [ ] Persistent database migration, rollback, backup and restore tested.
- [ ] Rate limiting and authentication validated behind reverse proxy.
- [ ] TLS, monitoring, alerting, and incident response documented and exercised.
- [ ] Load and soak tests pass on target hosting tier.
- [ ] Independent security review and limited beta completed.
