# 105 — Navigation responsiveness

## Scope

Investigate delayed clicks before further feature changes. Improve dev/Preview;
do not release to main or migrate financial data.

## Findings

- The deployed Preview functions ran in `iad1` (US), while its Neon database is
  in `sa-east-1` (São Paulo). Verified through deployment metadata and database
  endpoint region, without exposing connection credentials.
- Authenticated Settings navigation took about 3.1 seconds in the in-app browser;
  Overview and Positions also exceeded 3 seconds. Opening the local Add position
  dialog took about 0.3 seconds. These are browser automation observations, not a
  statistically controlled benchmark or a guaranteed response-time target.
- All routes were dynamic without loading boundaries. AppShell awaited quote
  refresh audit queries before returning any page content.
- Independent overview FX/allocation/gain reads were unnecessarily sequential.

## Changes

- Place Vercel functions in `gru1`, near the current database.
- Add accessible route-loading shells with working navigation and reduced-motion
  support; stream the quote status separately from the page.
- Parallelize independent overview reads and start the Positions editing catalog
  while resolving the month context. Keep all valuation and authorization rules.
- Do not add shared caching of private data, change credentials, move the database
  or alter provider refresh schedules.

## Verification

ESLint, TypeScript, 67 unit tests and production compilation pass. Verify the
deployed region and authenticated Overview/Positions/Settings navigation, including
mobile layout and opening/cancelling the position form without saving real data.

Deployed Preview verification on 2026-10-15 confirmed Ready with functions in
`gru1`. Observed click-to-content samples were Settings 640 ms, Positions 846 ms
in a fresh tab, and Overview 1269 ms. The loading shell appeared during navigation,
and quote status loaded after the page content. A 390 px mobile viewport had no
horizontal overflow; Add position opened and cancelled normally. No personal
portfolio records were modified. Direct database profiling from this computer was
unavailable, so no database-query-duration claim is made. Measurements are small
browser samples, affected by network and warm/cold runtime state.
