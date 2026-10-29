# Security hardening — 29 October 2026

This supersedes the dependency findings in the earlier review. Scope is the application repository and its Preview. No production migration, secret rotation, real account change, 2FA or password-recovery service was introduced.

## Dependency and supply-chain controls

The full installed production and development dependency audit reports zero advisories at verification time. Unused ExcelJS was removed. The shadcn scaffolding CLI and its vulnerable MCP/Express/undici graph were removed; its MIT-licensed Tailwind-only variants are retained verbatim locally. Remaining optional Prisma dependencies use explicitly patched deepmerge-ts, mysql2 and fast-uri overrides. Dependencies and the lockfile were regenerated and tested, not merely excluded from the audit. A CI audit workflow and immutable/read-only action revisions were prepared, but GitHub rejected publishing workflow changes because the OAuth connection lacks workflow scope. The application security fixes were published separately; the workflow patch is preserved locally and is not active on GitHub.

## Authentication and permissions

- Existing password policy, salted scrypt, current-password confirmation and immediate session revocation remain. The authentication secret must be at least 32 bytes. Session lifetime is one day with hourly refresh; cookies are explicitly HttpOnly, SameSite=Lax and Secure in production.
- Login limits combine Better Auth's IP controls with a normalized-account bucket. Anonymous self-signup is disabled, including for an allowlisted address: without email verification a public signup must not claim a permitted identity. Administrator CLI provisioning remains available.
- Authenticated API and mutation limits use atomic PostgreSQL counters and separate operation budgets. A parallel-request test confirms exactly the allowed requests succeed and another user retains a separate budget. Storage failure fails closed.
- Database access remains user-scoped; composite foreign keys additionally enforce ownership of positions/accounts/assets/months. Ownership changes are rejected at the scoped database boundary. No changes bypass those relations.

## Browser, request and provider boundaries

- A fresh cryptographic nonce is generated for each HTML request and forwarded to Next.js's rendering context. Production scripts use nonce + strict-dynamic, without unsafe-inline or unsafe-eval. Inline styles remain allowed for charts/animation; this exception does not permit executable inline scripts. HTML is dynamic and private/no-store. Framing, plugins, unsafe base/form destinations and unnecessary device permissions are blocked. HSTS and nosniff are enabled.
- Post-login destinations reject external origins, control characters and backslash normalization.
- Authentication request bodies are bounded to 16 KB before parsing, normal JSON lookup bodies to 32 KB, web backup requests to 10 MB (hosting may enforce a smaller limit), and backup tables to 100,000 records. JSON nesting and field-count budgets reject excessively deep input and prototype-pollution keys. Limits count streamed bytes, independent of Content-Length.
- Provider JSON is bounded to 5 MB; official Treasury data has separate bounded limits. The shared HTTP/official issuer/Treasury fetch paths follow only same-origin HTTPS GET redirects, preventing redirects from forwarding credentials to another server. Initial provider addresses are fixed in source; user identifiers never choose an arbitrary fetch origin. Other fixed-source SOAP readers retain their existing timeouts.
- The public health endpoint is a constant liveness response; it no longer reveals database state/latency or triggers unauthenticated database work.
- Unexpected database errors are not returned by Savings/bond actions. Backup/session logs retain only error type, not full query arguments or financial records.

## Backup isolation and compatibility

Web restore can only reference market/daily quotes already present on the server; it cannot create or overwrite global prices. Unknown global history rejects and rolls back the complete restore. Normal same-server backup round trips preserve version-5 format and user ownership. A new-server archive with missing global history requires the trusted administrator CLI import (`--apply`), never a client flag. Quote content from web input is not applied to the shared tables. No historical backups or financial data were rewritten.

## Verification

Unit tests cover streamed size limits, strict script policy, safe redirects, password rules and provider redirect isolation. Isolated integration tests cover cross-user read/write attempts and relation violations, malicious backup rollback, normal backup round-trip, concurrent/per-user rate limits, current-password confirmation, public signup rejection, session validation/revocation, old-password login compatibility and login/logout. Built-route HTTP tests cover CSP nonces, spoofed nonce headers, fake cookies, origin rejection, cookie attributes and size limits. Browser checks cover working navigation, charts, dialogs and mobile layout under the enforced CSP.

## Explicit limits

Zero dependency advisories means none known to the registry at that moment, not zero possible vulnerabilities. The owner explicitly excluded MFA and password recovery; email ownership verification/delivery is unavailable. Host/DNS account security, database firewall/role privileges, real secret entropy, encryption-at-rest/backup storage, monitoring/alerting, retention/privacy requirements and independent penetration testing remain operational responsibilities outside a source/Preview review. No claim of invulnerability or financial-industry certification is made.

Verification outcome: 176 unit tests passed, as did isolated account, ownership/backup/concurrency, built-route HTTP and historical-correction/Undo integrations. Preview commit `07d145a` was verified in desktop/mobile browser views with no application console errors. Temporary test data/schema were removed. The supplementary workflow patch remains in the local work directory because GitHub refused OAuth workflow updates; it is not represented as an active safeguard.
