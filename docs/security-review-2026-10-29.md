# Account security review — 29 October 2026

Superseded by [the completed hardening review](security-hardening-2026-10-29.md). Findings below describe the earlier snapshot, not the current dependency state.

Scope: source review, installed dependency audit, isolated authentication integration tests and Preview browser checks. This is not an independent penetration test or a certification of infrastructure security. No real account password or portfolio was changed.

## Tolerance finding

`get-allocation-overview` and `rebalance.ts` still calculate target/tolerance bands. `allocation-explorer.tsx` passes only current allocation shares and explicitly sets `targetShare: null` for the rendered bars. Consequently the Settings tolerance has no visible effect in today's Overview. The earlier explanation that users could see its bands there was incorrect. No allocation or tolerance data was removed during this review.

## Confirmed controls

- Better Auth 1.7.7 uses scrypt with a fresh 16-byte random salt for each password (installed implementation: N=16384, r=16, p=1, 64-byte derived key). The stored value is a one-way salted hash, not plaintext or reversible encryption. Actual user password hashes were not retrieved.
- Database-backed request limits, origin validation and authoritative authenticated sessions protect account endpoints. Password/email changes require the current password. Email changes preserve the user ID and revoke all sessions; password changes revoke other sessions. Session cookie cache is disabled for immediate revocation.
- Portfolio database operations use verified user scoping; backup/provider endpoints require sessions. Prior isolated ownership tests and current authentication tests verify relevant boundaries; this is not exhaustive coverage of every possible query.
- Public account creation remains allowlisted. Email address ownership is not verified through an email-delivery service. Multi-factor authentication is not implemented.

## Changes

- Newly chosen passwords require 15–128 characters, uppercase, lowercase, a digit and a non-whitespace symbol. The rule applies on the server and in account creation/change UI; login with existing passwords remains compatible. No forced reset was performed. The user's requested composition rule is stricter than NIST's composition recommendation; length and uniqueness remain essential.
- Added browser headers: nosniff, frame denial, limited referrer policy, disabled unused camera/microphone/geolocation, and CSP frame/object/base/form restrictions. This is not a complete nonce-based script CSP.
- Dependency audit flagged installed Next.js 16.3.8 and Zod 4.6.5. Updated to fixed Next.js 16.4.1 and Zod 4.6.6, verified by the final build/tests. These advisories do not by themselves prove exploitability of this app.

## Remaining work before a public customer release

- Independent penetration testing, MFA/passkeys, email ownership verification/recovery, and security-event monitoring.
- Resolve remaining dependency advisories after determining reachability. Initial production dependency audit included tool-only shadcn/MCP/Express/undici and optional Prisma/MySQL packages, as well as ExcelJS/uuid. Moving or dismissing a dependency does not fix its advisory.
- Verify hosting/database access, encryption-at-rest/backups, secret rotation and operational recovery outside this source review. Financial amounts are ordinary user data, not bank-grade end-to-end encrypted storage or custody.

Sources: [Better Auth security](https://better-auth.com/docs/reference/security), [NIST password guidance](https://pages.nist.gov/800-63-4/sp800-63b.html), installed source and public registry audit.

Final registry audit after these updates: 0 critical, 10 high, 12 moderate and 3 low advisories remain across installed production-dependency graphs. No Next.js advisory remains; the remaining Zod finding is version 3.25.76 nested under the shadcn tool, not the application/auth Zod 4.6.6. These remaining findings are unresolved and were not silently suppressed.
