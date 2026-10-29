# Security

This repository is a private investment tracker, not a payment processor or custodian. Report suspected vulnerabilities privately to the repository owner. Do not post credentials, backup files or portfolio details in public issues.

Security checks have been prepared for pushes and pull requests; publishing the workflow is pending GitHub workflow permission. Dependency audits cover development and production graphs. Keep the lockfile and immutable GitHub Actions references under review; a clean audit is not a penetration-test certificate.

Public account provisioning is disabled while email ownership verification is unavailable. Accounts are created through the protected administrator CLI; passwords require 15–128 characters with uppercase, lowercase, a digit and a symbol. Password reset and two-factor authentication are intentionally not configured at the owner's request. Administrators must not bypass authentication or disclose account passwords to recover access.

Production requires a random `BETTER_AUTH_SECRET` of at least 32 bytes, HTTPS, restricted hosting/database access and reliable encrypted backups. Never rotate the secret or restore financial data without an explicit recovery plan. No production migration or secret rotation is performed by the security checks.

See `docs/security-review-2026-10-29.md` and `docs/security-hardening-2026-10-29.md` for the scope, verification and residual operational requirements.
