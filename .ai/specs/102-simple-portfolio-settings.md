# 102 — Simple portfolio settings and current allocation

Victor's final request keeps only tolerance in Settings and current holdings in
Overview allocation. Hide all target, strategy and buy/sell preview cards. Currency
composition remains available in Overview. Remove automatic target creation and
its notification on app-open checks. Existing target records, transaction history,
schema and backup contracts remain unchanged.

Tolerance has a separate authenticated, user-scoped save action. It updates only
the tolerance field and does not validate or rewrite hidden target percentages.
A user without a plan can save tolerance without receiving default target weights.
Input validation, discard behavior and unsaved-change protection remain available.

Settings no longer renders the former allocation editor or supplementary panels.
Current allocation charts, including fixed-income details and hover tooltips, show
no targets. Preserve the month selector, portfolio gain cards and evolution graph.

Target dev/Preview only. Production requires separate release approval.

## Validation

ESLint, TypeScript and all 67 unit tests pass. Production build passes. An isolated
integration test confirms independent tolerance validation, preservation of hidden
weights, user isolation and first-time settings with no default allocation targets.
Browser checks with fictitious data verify save/persistence, desktop/mobile layout,
current-only allocation and the currency view. The standalone Playwright suite was
not run; no additional browser was installed. No production data was used for writes.
