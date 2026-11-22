# Phase 14 — Trusted session administration

Adds `src/app/SessionAdministration.js` and the offline CLI `src/app/manageSessions.js`.

## Safety and usage

**Stop the multi-user application before running the CLI.** Ownership and user stores are currently single-process file-backed stores; editing while the API is running risks stale in-memory authorization and lost updates. This CLI must run only in a trusted Termux shell, not through a public API.

Provision an account first:

```sh
node src/app/provisionUser.js alice
```

Then, while the application is stopped:

```sh
node src/app/manageSessions.js assign alice alice_phone
node src/app/manageSessions.js list
node src/app/manageSessions.js revoke alice alice_phone
```

Revoking ownership **does not log out WhatsApp or delete credentials**. For safety, stop the app before revoking. After restarting, the revoked session will not be restored as an authorized session. Keep auth directories private.

Maximum registered sessions defaults to three, matching the application default. Do not change the limit in only one component.

## Validation

```sh
node --test tests/*.test.js
```

The new tests exercise persistent assignment, unknown users, duplicates, concurrent capacity, revocation, and unsafe identifiers. This phase does not expose public registration or session assignment endpoints.
