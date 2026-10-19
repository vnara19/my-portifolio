# Selic sync outage recovery

GitHub Actions runs 146 and 147 updated all eight due market symbols successfully,
then exited 1 because the independent SGS432 Selic request had HTTP 500 cached.
The last successful workflow was run 127 on 18 October 2026. Run 147:
https://github.com/vnara19/my-portifolio/actions/runs/39287897346

A failed reference-rate attempt previously suppressed new provider calls for the
same 24 hours as a successful observation. The next scheduled executions therefore
replayed the recorded error even after the official JSON service had recovered.
A read-only live probe on 19 October returned valid SGS432 observations through
19 October from the official source.

Fix:
- Keep the 24-hour interval after successful checks.
- Retry failed checks after 30 minutes, so the next hourly workflow can recover.
- Retry transient JSON provider/network errors once before the official SOAP fallback.
- Bound JSON attempts to 10 seconds and SOAP to 15 seconds.
- Keep failure status for real ongoing outages; retain the last valid observation.
- Preserve the hourly production schedule and all market quote writes/calculations.

Regression tests cover transient HTTP 500 recovery, cached failure suppression,
retry at the 30-minute boundary, retained previous values, clearing stale errors,
and restored daily caching after success. Existing invalid/future-date and SGS432
series validation remains in place.

The source fix is prepared independently against origin/main in the sibling
selic-sync-hotfix checkout. Publishing it requires explicit production approval;
it must not merge the unrelated investment UI changes currently on dev.
